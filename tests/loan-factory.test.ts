// LoanFactory.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface Milestone {
  block: number;
  requiredScore: number;
  tranchePercent: number;
}

interface LoanDetails {
  farmer: string;
  lender: string | null;
  amount: number;
  disbursedAmount: number;
  repaidAmount: number;
  interestRate: number;
  duration: number;
  startBlock: number;
  endBlock: number;
  state: number;
  biodiversityBaseline: number;
  biodiversityGoal: number;
  milestones: Milestone[];
  collateral: number;
  penaltyRate: number;
}

interface MetricUpdate {
  score: number;
  timestamp: number;
  verifier: string;
}

interface ContractState {
  paused: boolean;
  admin: string;
  loanCounter: number;
  loans: Map<number, LoanDetails>;
  loanMetricsHistory: Map<string, MetricUpdate>; // Key: `${loanId}-${updateId}`
  loanUpdateCounter: Map<number, number>;
}

// Mock contract implementation
class LoanFactoryMock {
  private state: ContractState = {
    paused: false,
    admin: "deployer",
    loanCounter: 0,
    loans: new Map(),
    loanMetricsHistory: new Map(),
    loanUpdateCounter: new Map(),
  };

  private ERR_UNAUTHORIZED = 100;
  private ERR_INVALID_AMOUNT = 101;
  private ERR_INVALID_DURATION = 102;
  private ERR_INVALID_GOAL = 103;
  private ERR_LOAN_EXISTS = 104;
  private ERR_LOAN_NOT_FOUND = 105;
  private ERR_INVALID_STATE = 106;
  private ERR_METRIC_NOT_MET = 107;
  private ERR_ALREADY_APPROVED = 108;
  private ERR_PAUSED = 109;
  private ERR_INVALID_INTEREST = 110;
  private ERR_INVALID_MILESTONE = 111;
  private ERR_NO_MILESTONES = 112;
  private ERR_INSUFFICIENT_COLLATERAL = 113;
  private ERR_DEFAULTED = 114;
  private ERR_NOT_VERIFIER = 115;

  private LOAN_STATE_PENDING = 0;
  private LOAN_STATE_APPROVED = 1;
  private LOAN_STATE_ACTIVE = 2;
  private LOAN_STATE_REPAID = 3;
  private LOAN_STATE_DEFAULTED = 4;

  private MIN_LOAN_AMOUNT = 1000000;
  private MAX_LOAN_AMOUNT = 1000000000000;
  private MAX_INTEREST_RATE = 2000;

  private currentBlock = 100; // Mock block height

  // Mock block height increment for tests
  advanceBlock(blocks: number) {
    this.currentBlock += blocks;
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  createLoan(
    caller: string,
    amount: number,
    interestRate: number,
    duration: number,
    biodiversityGoal: number,
    biodiversityBaseline: number,
    milestones: Milestone[],
    collateral: number,
    penaltyRate: number
  ): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (amount < this.MIN_LOAN_AMOUNT || amount > this.MAX_LOAN_AMOUNT) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (duration <= 0 || duration > 525600) {
      return { ok: false, value: this.ERR_INVALID_DURATION };
    }
    if (biodiversityGoal <= biodiversityBaseline) {
      return { ok: false, value: this.ERR_INVALID_GOAL };
    }
    if (interestRate > this.MAX_INTEREST_RATE) {
      return { ok: false, value: this.ERR_INVALID_INTEREST };
    }
    if (milestones.length === 0) {
      return { ok: false, value: this.ERR_NO_MILESTONES };
    }
    if (!milestones.every(m => m.block > 0 && m.requiredScore > 0 && m.tranchePercent > 0 && m.tranchePercent <= 100)) {
      return { ok: false, value: this.ERR_INVALID_MILESTONE };
    }
    const loanId = this.state.loanCounter + 1;
    if (this.state.loans.has(loanId)) {
      return { ok: false, value: this.ERR_LOAN_EXISTS };
    }
    this.state.loans.set(loanId, {
      farmer: caller,
      lender: null,
      amount,
      disbursedAmount: 0,
      repaidAmount: 0,
      interestRate,
      duration,
      startBlock: 0,
      endBlock: 0,
      state: this.LOAN_STATE_PENDING,
      biodiversityBaseline,
      biodiversityGoal,
      milestones,
      collateral,
      penaltyRate,
    });
    this.state.loanUpdateCounter.set(loanId, 0);
    this.state.loanCounter = loanId;
    return { ok: true, value: loanId };
  }

  approveLoan(caller: string, loanId: number, initialDisbursement: number): ClarityResponse<boolean> {
    const loan = this.state.loans.get(loanId);
    if (!loan) {
      return { ok: false, value: this.ERR_LOAN_NOT_FOUND };
    }
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (loan.state !== this.LOAN_STATE_PENDING) {
      return { ok: false, value: this.ERR_INVALID_STATE };
    }
    if (loan.lender !== null) {
      return { ok: false, value: this.ERR_ALREADY_APPROVED };
    }
    if (initialDisbursement > loan.amount) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    loan.lender = caller;
    loan.state = this.LOAN_STATE_APPROVED;
    loan.startBlock = this.currentBlock;
    loan.endBlock = this.currentBlock + loan.duration;
    loan.disbursedAmount = initialDisbursement;
    return { ok: true, value: true };
  }

  submitMetricUpdate(caller: string, loanId: number, score: number): ClarityResponse<boolean> {
    const loan = this.state.loans.get(loanId);
    if (!loan) {
      return { ok: false, value: this.ERR_LOAN_NOT_FOUND };
    }
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (loan.state !== this.LOAN_STATE_ACTIVE) {
      return { ok: false, value: this.ERR_INVALID_STATE };
    }
    // Assume caller is verifier for mock
    const updateCount = this.state.loanUpdateCounter.get(loanId) ?? 0;
    const key = `${loanId}-${updateCount}`;
    this.state.loanMetricsHistory.set(key, { score, timestamp: this.currentBlock, verifier: caller });
    this.state.loanUpdateCounter.set(loanId, updateCount + 1);
    // Mock milestone check and disbursement
    const eligible = this.calculateEligibleDisbursement(loanId, score);
    if (eligible > 0) {
      loan.disbursedAmount += eligible;
    }
    return { ok: true, value: true };
  }

  repayLoan(caller: string, loanId: number, amount: number): ClarityResponse<boolean> {
    const loan = this.state.loans.get(loanId);
    if (!loan) {
      return { ok: false, value: this.ERR_LOAN_NOT_FOUND };
    }
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (caller !== loan.farmer) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (loan.state !== this.LOAN_STATE_ACTIVE) {
      return { ok: false, value: this.ERR_INVALID_STATE };
    }
    const totalDue = loan.disbursedAmount + (loan.disbursedAmount * loan.interestRate / 10000);
    if (loan.repaidAmount + amount > totalDue) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    loan.repaidAmount += amount;
    if (loan.repaidAmount >= totalDue) {
      loan.state = this.LOAN_STATE_REPAID;
    }
    return { ok: true, value: true };
  }

  defaultLoan(caller: string, loanId: number): ClarityResponse<boolean> {
    const loan = this.state.loans.get(loanId);
    if (!loan) {
      return { ok: false, value: this.ERR_LOAN_NOT_FOUND };
    }
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (caller !== loan.lender) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (loan.state !== this.LOAN_STATE_ACTIVE) {
      return { ok: false, value: this.ERR_INVALID_STATE };
    }
    if (this.currentBlock <= loan.endBlock) {
      return { ok: false, value: this.ERR_INVALID_STATE };
    }
    loan.state = this.LOAN_STATE_DEFAULTED;
    return { ok: true, value: true };
  }

  getLoanDetails(loanId: number): ClarityResponse<LoanDetails | null> {
    return { ok: true, value: this.state.loans.get(loanId) ?? null };
  }

  getLoanMetricHistory(loanId: number, updateId: number): ClarityResponse<MetricUpdate | null> {
    const key = `${loanId}-${updateId}`;
    return { ok: true, value: this.state.loanMetricsHistory.get(key) ?? null };
  }

  getLoanState(loanId: number): ClarityResponse<number> {
    const loan = this.state.loans.get(loanId);
    return { ok: true, value: loan ? loan.state : this.LOAN_STATE_PENDING };
  }

  isContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  calculateInterest(loanId: number): ClarityResponse<number> {
    const loan = this.state.loans.get(loanId);
    return { ok: true, value: loan ? (loan.disbursedAmount * loan.interestRate / 10000) : 0 };
  }

  getPendingDisbursement(loanId: number): ClarityResponse<number> {
    const loan = this.state.loans.get(loanId);
    if (!loan) {
      return { ok: true, value: 0 };
    }
    // Assume latest score from last update
    const updateCount = this.state.loanUpdateCounter.get(loanId) ?? 0;
    if (updateCount === 0) {
      return { ok: true, value: 0 };
    }
    const key = `${loanId}-${updateCount - 1}`;
    const metric = this.state.loanMetricsHistory.get(key);
    const score = metric ? metric.score : 0;
    return { ok: true, value: this.calculateEligibleDisbursement(loanId, score) };
  }

  private calculateEligibleDisbursement(loanId: number, currentScore: number): number {
    const loan = this.state.loans.get(loanId);
    if (!loan) return 0;
    let eligible = 0;
    for (const milestone of loan.milestones) {
      if (this.currentBlock >= loan.startBlock + milestone.block &&
          currentScore >= milestone.requiredScore &&
          loan.disbursedAmount < loan.amount) {
        eligible += (loan.amount * milestone.tranchePercent / 100);
      }
    }
    return eligible;
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  farmer: "farmer_1",
  lender: "lender_1",
  verifier: "verifier_1",
};

describe("LoanFactory Contract", () => {
  let contract: LoanFactoryMock;

  beforeEach(() => {
    contract = new LoanFactoryMock();
    vi.resetAllMocks();
  });

  it("should allow admin to pause and unpause the contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: true });

    const createDuringPause = contract.createLoan(
      accounts.farmer,
      2000000,
      500,
      1000,
      90,
      70,
      [{ block: 500, requiredScore: 80, tranchePercent: 50 }],
      0,
      100
    );
    expect(createDuringPause).toEqual({ ok: false, value: 109 });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent non-admin from pausing", () => {
    const pauseResult = contract.pauseContract(accounts.farmer);
    expect(pauseResult).toEqual({ ok: false, value: 100 });
  });

  it("should create a new loan with valid parameters", () => {
    const milestones: Milestone[] = [
      { block: 500, requiredScore: 80, tranchePercent: 50 },
      { block: 1000, requiredScore: 90, tranchePercent: 50 },
    ];
    const createResult = contract.createLoan(
      accounts.farmer,
      5000000,
      500,
      2000,
      95,
      75,
      milestones,
      1000000,
      1000
    );
    expect(createResult).toEqual({ ok: true, value: 1 });

    const details = contract.getLoanDetails(1);
    expect(details).toEqual({
      ok: true,
      value: expect.objectContaining({
        farmer: accounts.farmer,
        lender: null,
        amount: 5000000,
        disbursedAmount: 0,
        repaidAmount: 0,
        interestRate: 500,
        duration: 2000,
        startBlock: 0,
        endBlock: 0,
        state: 0,
        biodiversityBaseline: 75,
        biodiversityGoal: 95,
        milestones,
        collateral: 1000000,
        penaltyRate: 1000,
      }),
    });
  });

  it("should reject loan creation with invalid amount", () => {
    const createResult = contract.createLoan(
      accounts.farmer,
      500000, // Below min
      500,
      1000,
      90,
      70,
      [{ block: 500, requiredScore: 80, tranchePercent: 50 }],
      0,
      100
    );
    expect(createResult).toEqual({ ok: false, value: 101 });
  });

  it("should approve a pending loan", () => {
    contract.createLoan(
      accounts.farmer,
      5000000,
      500,
      2000,
      95,
      75,
      [{ block: 500, requiredScore: 80, tranchePercent: 50 }],
      0,
      100
    );

    const approveResult = contract.approveLoan(accounts.lender, 1, 1000000);
    expect(approveResult).toEqual({ ok: true, value: true });

    const details = contract.getLoanDetails(1);
    expect(details).toEqual({
      ok: true,
      value: expect.objectContaining({
        lender: accounts.lender,
        state: 1,
        disbursedAmount: 1000000,
        startBlock: 100,
        endBlock: 2100,
      }),
    });
  });

  it("should submit metric update and check disbursement", () => {
    contract.createLoan(
      accounts.farmer,
      5000000,
      500,
      2000,
      95,
      75,
      [{ block: 500, requiredScore: 80, tranchePercent: 50 }],
      0,
      100
    );
    contract.approveLoan(accounts.lender, 1, 0);

    // Set to active manually for test (in real, after approval)
    const loan = contract.getLoanDetails(1).value as LoanDetails;
    loan.state = 2;
    
    contract.advanceBlock(500);
    const updateResult = contract.submitMetricUpdate(accounts.verifier, 1, 85);
    expect(updateResult).toEqual({ ok: true, value: true });

    const pending = contract.getPendingDisbursement(1);
    expect(pending).toEqual({ ok: true, value: 2500000 }); // 50% of 5M

    const details = contract.getLoanDetails(1);
    expect(details).toEqual({
      ok: true,
      value: expect.objectContaining({ disbursedAmount: 2500000 }),
    });
  });

  it("should allow repayment and mark as repaid when complete", () => {
    contract.createLoan(
      accounts.farmer,
      5000000,
      500,
      2000,
      95,
      75,
      [{ block: 500, requiredScore: 80, tranchePercent: 100 }],
      0,
      100
    );
    contract.approveLoan(accounts.lender, 1, 5000000);

    // Set to active
    const loan = contract.getLoanDetails(1).value as LoanDetails;
    loan.state = 2;

    const interest = contract.calculateInterest(1).value as number;
    expect(interest).toBe(250000); // 5M * 5%

    const repayResult = contract.repayLoan(accounts.farmer, 1, 5250000);
    expect(repayResult).toEqual({ ok: true, value: true });

    const state = contract.getLoanState(1);
    expect(state).toEqual({ ok: true, value: 3 });
  });

  it("should allow defaulting overdue loan", () => {
    contract.createLoan(
      accounts.farmer,
      5000000,
      500,
      2000,
      95,
      75,
      [{ block: 500, requiredScore: 80, tranchePercent: 100 }],
      0,
      100
    );
    contract.approveLoan(accounts.lender, 1, 5000000);

    // Set to active
    const loan = contract.getLoanDetails(1).value as LoanDetails;
    loan.state = 2;

    contract.advanceBlock(2001);
    const defaultResult = contract.defaultLoan(accounts.lender, 1);
    expect(defaultResult).toEqual({ ok: true, value: true });

    const state = contract.getLoanState(1);
    expect(state).toEqual({ ok: true, value: 4 });
  });

  it("should prevent defaulting non-overdue loan", () => {
    contract.createLoan(
      accounts.farmer,
      5000000,
      500,
      2000,
      95,
      75,
      [{ block: 500, requiredScore: 80, tranchePercent: 100 }],
      0,
      100
    );
    contract.approveLoan(accounts.lender, 1, 5000000);

    // Set to active
    const loan = contract.getLoanDetails(1).value as LoanDetails;
    loan.state = 2;

    const defaultResult = contract.defaultLoan(accounts.lender, 1);
    expect(defaultResult).toEqual({ ok: false, value: 106 });
  });
});