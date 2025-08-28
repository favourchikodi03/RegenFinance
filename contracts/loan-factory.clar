;; LoanFactory.clar
;; Core contract for creating and managing biodiversity-linked loans in RegenFinance.
;; This contract handles loan origination, state management, metric-linked adjustments,
;; integrations with other contracts (e.g., UserRegistry, BiodiversityOracle, VerificationEngine,
;; EscrowVault, PaymentProcessor), and governance hooks.
;; Loans are customizable with terms tied to biodiversity metrics for regenerative agriculture financing.

;; Constants
(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-INVALID-AMOUNT u101)
(define-constant ERR-INVALID-DURATION u102)
(define-constant ERR-INVALID-GOAL u103)
(define-constant ERR-LOAN-EXISTS u104)
(define-constant ERR-LOAN-NOT-FOUND u105)
(define-constant ERR-INVALID-STATE u106)
(define-constant ERR-METRIC-NOT-MET u107)
(define-constant ERR-ALREADY-APPROVED u108)
(define-constant ERR-PAUSED u109)
(define-constant ERR-INVALID-INTEREST u110)
(define-constant ERR-INVALID-MILESTONE u111)
(define-constant ERR-NO-MILESTONES u112)
(define-constant ERR-INSUFFICIENT-COLLATERAL u113)
(define-constant ERR-DEFAULTED u114)
(define-constant ERR-NOT-VERIFIER u115)

(define-constant LOAN-STATE-PENDING u0)
(define-constant LOAN-STATE-APPROVED u1)
(define-constant LOAN-STATE-ACTIVE u2)
(define-constant LOAN-STATE-REPAID u3)
(define-constant LOAN-STATE-DEFAULTED u4)

(define-constant MAX-MILESTONES u10)
(define-constant MAX-INTEREST-RATE u2000) ;; 20.00% in basis points
(define-constant MIN-LOAN-AMOUNT u1000000) ;; 1 STX (in microstacks)
(define-constant MAX-LOAN-AMOUNT u1000000000000) ;; 1,000,000 STX

;; Data Variables
(define-data-var contract-paused bool false)
(define-data-var admin principal tx-sender)
(define-data-var loan-counter uint u0)

;; Data Maps
(define-map loans
  { loan-id: uint }
  {
    farmer: principal,
    lender: (optional principal), ;; Set upon approval
    amount: uint, ;; In microstacks
    disbursed-amount: uint,
    repaid-amount: uint,
    interest-rate: uint, ;; Basis points (e.g., 500 = 5%)
    duration: uint, ;; In blocks
    start-block: uint,
    end-block: uint,
    state: uint,
    biodiversity-baseline: uint, ;; Initial score
    biodiversity-goal: uint, ;; Target score
    milestones: (list 10 { block: uint, required-score: uint, tranche-percent: uint }),
    collateral: uint, ;; Optional collateral amount
    penalty-rate: uint ;; Basis points for default
  }
)

(define-map loan-metrics-history
  { loan-id: uint, update-id: uint }
  {
    score: uint,
    timestamp: uint,
    verifier: principal
  }
)

(define-map loan-update-counter
  { loan-id: uint }
  uint
)

;; Private Functions
(define-private (is-admin (caller principal))
  (is-eq caller (var-get admin))
)

(define-private (is-registered-farmer (user principal))
  ;; Mock integration: In real, call UserRegistry.clar to check if user is registered as farmer
  (ok true)
)

(define-private (is-registered-lender (user principal))
  ;; Mock integration: Check UserRegistry
  (ok true)
)

(define-private (is-registered-verifier (user principal))
  ;; Mock integration: Check UserRegistry
  (ok true)
)

(define-private (get-latest-metric (loan-id uint))
  (let ((update-count (default-to u0 (map-get? loan-update-counter { loan-id: loan-id }))))
    (if (> update-count u0)
      (map-get? loan-metrics-history { loan-id: loan-id, update-id: (- update-count u1) })
      none
    )
  )
)

(define-private (check-milestone (loan-details { amount: uint, disbursed-amount: uint, milestones: (list 10 { block: uint, required-score: uint, tranche-percent: uint }), start-block: uint })
                 (current-block uint)
                 (current-score uint))
  (fold check-milestone-inner (get milestones loan-details) { eligible: u0, details: loan-details, current-block: current-block, current-score: current-score })
)

(define-private (check-milestone-inner (milestone { block: uint, required-score: uint, tranche-percent: uint })
                                       (acc { eligible: uint, details: { amount: uint, disbursed-amount: uint, milestones: (list 10 { block: uint, required-score: uint, tranche-percent: uint }), start-block: uint }, current-block: uint, current-score: uint }))
  (let ((details (get details acc))
        (disbursed (get disbursed-amount details))
        (total (get amount details)))
    (if (and (>= (get current-block acc) (+ (get start-block details) (get block milestone)))
             (>= (get current-score acc) (get required-score milestone))
             (< disbursed total)) ;; Not fully disbursed
      (merge acc { eligible: (+ (get eligible acc) (* total (get tranche-percent milestone) / u100)) })
      acc
    )
  )
)

;; Public Functions
(define-public (pause-contract)
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (var-set contract-paused true)
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (var-set contract-paused false)
    (ok true)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (create-loan (amount uint) (interest-rate uint) (duration uint) (biodiversity-goal uint)
                            (biodiversity-baseline uint) (milestones (list 10 { block: uint, required-score: uint, tranche-percent: uint }))
                            (collateral uint) (penalty-rate uint))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-ok (is-registered-farmer tx-sender)) (err ERR-UNAUTHORIZED))
    (asserts! (and (>= amount MIN-LOAN-AMOUNT) (<= amount MAX-LOAN-AMOUNT)) (err ERR-INVALID-AMOUNT))
    (asserts! (and (> duration u0) (<= duration u525600)) (err ERR-INVALID-DURATION)) ;; ~1 year in blocks
    (asserts! (> biodiversity-goal biodiversity-baseline) (err ERR-INVALID-GOAL))
    (asserts! (<= interest-rate MAX-INTEREST-RATE) (err ERR-INVALID-INTEREST))
    (asserts! (> (len milestones) u0) (err ERR-NO-MILESTONES))
    (asserts! (fold validate-milestone milestones true) (err ERR-INVALID-MILESTONE))
    (let ((loan-id (+ (var-get loan-counter) u1)))
      (asserts! (is-none (map-get? loans { loan-id: loan-id })) (err ERR-LOAN-EXISTS))
      (map-set loans { loan-id: loan-id }
        {
          farmer: tx-sender,
          lender: none,
          amount: amount,
          disbursed-amount: u0,
          repaid-amount: u0,
          interest-rate: interest-rate,
          duration: duration,
          start-block: u0, ;; Set on approval
          end-block: u0,
          state: LOAN-STATE-PENDING,
          biodiversity-baseline: biodiversity-baseline,
          biodiversity-goal: biodiversity-goal,
          milestones: milestones,
          collateral: collateral,
          penalty-rate: penalty-rate
        }
      )
      (map-set loan-update-counter { loan-id: loan-id } u0)
      (var-set loan-counter loan-id)
      (print { event: "loan-created", loan-id: loan-id, farmer: tx-sender })
      (ok loan-id)
    )
  )
)

(define-private (validate-milestone (milestone { block: uint, required-score: uint, tranche-percent: uint }) (valid bool))
  (and valid (> (get block milestone) u0) (> (get required-score milestone) u0) (and (> (get tranche-percent milestone) u0) (<= (get tranche-percent milestone) u100)))
)

(define-public (approve-loan (loan-id uint) (initial-disbursement uint))
  (let ((loan (unwrap! (map-get? loans { loan-id: loan-id }) (err ERR-LOAN-NOT-FOUND))))
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-ok (is-registered-lender tx-sender)) (err ERR-UNAUTHORIZED))
    (asserts! (is-eq (get state loan) LOAN-STATE-PENDING) (err ERR-INVALID-STATE))
    (asserts! (is-none (get lender loan)) (err ERR-ALREADY-APPROVED))
    (asserts! (<= initial-disbursement (get amount loan)) (err ERR-INVALID-AMOUNT))
    ;; Transfer collateral if required (mock integration with EscrowVault)
    (if (> (get collateral loan) u0)
      (asserts! (>= (stx-get-balance (get farmer loan)) (get collateral loan)) (err ERR-INSUFFICIENT-COLLATERAL))
      true
    )
    (map-set loans { loan-id: loan-id }
      (merge loan {
        lender: (some tx-sender),
        state: LOAN-STATE-APPROVED,
        start-block: block-height,
        end-block: (+ block-height (get duration loan)),
        disbursed-amount: initial-disbursement
      })
    )
    ;; Mock call to EscrowVault to disburse initial amount
    (print { event: "loan-approved", loan-id: loan-id, lender: tx-sender, initial-disbursement: initial-disbursement })
    (ok true)
  )
)

(define-public (submit-metric-update (loan-id uint) (score uint))
  (let ((loan (unwrap! (map-get? loans { loan-id: loan-id }) (err ERR-LOAN-NOT-FOUND)))
        (update-count (default-to u0 (map-get? loan-update-counter { loan-id: loan-id }))))
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-ok (is-registered-verifier tx-sender)) (err ERR-NOT-VERIFIER))
    (asserts! (is-eq (get state loan) LOAN-STATE-ACTIVE) (err ERR-INVALID-STATE))
    ;; Mock integration with BiodiversityOracle and VerificationEngine
    (map-set loan-metrics-history { loan-id: loan-id, update-id: update-count }
      { score: score, timestamp: block-height, verifier: tx-sender }
    )
    (map-set loan-update-counter { loan-id: loan-id } (+ update-count u1))
    (print { event: "metric-updated", loan-id: loan-id, score: score })
    ;; Check for milestone disbursement
    (let ((latest-metric (unwrap! (get-latest-metric loan-id) (err ERR-LOAN-NOT-FOUND)))
          (check-result (check-milestone loan block-height (get score latest-metric))))
      (if (> (get eligible check-result) u0)
        ;; Mock call to EscrowVault to disburse
        (map-set loans { loan-id: loan-id }
          (merge loan { disbursed-amount: (+ (get disbursed-amount loan) (get eligible check-result)) })
        )
        true
      )
    )
    ;; Check if goal met for interest adjustment (mock PaymentProcessor)
    (if (>= score (get biodiversity-goal loan))
      (print { event: "goal-met", loan-id: loan-id })
      true
    )
    (ok true)
  )
)

(define-public (repay-loan (loan-id uint) (amount uint))
  (let ((loan (unwrap! (map-get? loans { loan-id: loan-id }) (err ERR-LOAN-NOT-FOUND))))
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-eq tx-sender (get farmer loan)) (err ERR-UNAUTHORIZED))
    (asserts! (is-eq (get state loan) LOAN-STATE-ACTIVE) (err ERR-INVALID-STATE))
    (asserts! (<= (+ (get repaid-amount loan) amount) (+ (get disbursed-amount loan) (* (get disbursed-amount loan) (get interest-rate loan) / u10000))) (err ERR-INVALID-AMOUNT))
    ;; Mock integration with PaymentProcessor for repayment
    (map-set loans { loan-id: loan-id }
      (merge loan { repaid-amount: (+ (get repaid-amount loan) amount) })
    )
    (if (>= (get repaid-amount loan) (+ (get disbursed-amount loan) (* (get disbursed-amount loan) (get interest-rate loan) / u10000)))
      (map-set loans { loan-id: loan-id }
        (merge loan { state: LOAN-STATE-REPAID })
      )
      true
    )
    (print { event: "loan-repaid", loan-id: loan-id, amount: amount })
    (ok true)
  )
)

(define-public (default-loan (loan-id uint))
  (let ((loan (unwrap! (map-get? loans { loan-id: loan-id }) (err ERR-LOAN-NOT-FOUND))))
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-eq tx-sender (unwrap! (get lender loan) (err ERR-LOAN-NOT-FOUND))) (err ERR-UNAUTHORIZED))
    (asserts! (is-eq (get state loan) LOAN-STATE-ACTIVE) (err ERR-INVALID-STATE))
    (asserts! (> block-height (get end-block loan)) (err ERR-INVALID-STATE))
    (map-set loans { loan-id: loan-id }
      (merge loan { state: LOAN-STATE-DEFAULTED })
    )
    ;; Mock penalty application via PaymentProcessor, collateral claim via EscrowVault
    (print { event: "loan-defaulted", loan-id: loan-id })
    (ok true)
  )
)

;; Read-Only Functions
(define-read-only (get-loan-details (loan-id uint))
  (map-get? loans { loan-id: loan-id })
)

(define-read-only (get-loan-metric-history (loan-id uint) (update-id uint))
  (map-get? loan-metrics-history { loan-id: loan-id, update-id: update-id })
)

(define-read-only (get-loan-state (loan-id uint))
  (match (map-get? loans { loan-id: loan-id })
    loan (get state loan)
    none LOAN-STATE-PENDING ;; Default for non-existent
  )
)

(define-read-only (is-contract-paused)
  (var-get contract-paused)
)

(define-read-only (get-admin)
  (var-get admin)
)

(define-read-only (calculate-interest (loan-id uint))
  (match (map-get? loans { loan-id: loan-id })
    loan (* (get disbursed-amount loan) (get interest-rate loan) / u10000)
    none u0
  )
)

(define-read-only (get-pending-disbursement (loan-id uint))
  (match (map-get? loans { loan-id: loan-id })
    loan
    (let ((latest-metric (get-latest-metric loan-id)))
      (if (is-some latest-metric)
        (get eligible (check-milestone loan block-height (get score (unwrap! latest-metric none))))
        u0
      )
    )
    none u0
  )
)