# 🌱 RegenFinance: Supply Chain Financing for Regenerative Agriculture

Welcome to RegenFinance, a Web3 platform that revolutionizes financing for regenerative agriculture! This project addresses the real-world challenge of funding sustainable farming practices by linking loans directly to verifiable biodiversity metrics. Farmers often struggle to access capital for regenerative methods (like cover cropping, no-till farming, and agroforestry) that improve soil health and ecosystem diversity, but traditional lenders overlook these environmental benefits. Using the Stacks blockchain and Clarity smart contracts, RegenFinance enables transparent, automated financing where loan terms (interest rates, disbursements, and repayments) are tied to on-chain verified biodiversity improvements—such as soil carbon levels, species diversity, and water retention—sourced from trusted oracles or satellite data.

This ensures lenders fund impactful projects, farmers get fair incentives for eco-friendly practices, and the supply chain becomes more resilient and transparent. The system involves 8 smart contracts to handle registration, metrics verification, lending, escrow, payments, governance, tokenization, and reporting.

## ✨ Features

🌍 **Biodiversity-Linked Loans**: Loans automatically adjust based on verified metrics (e.g., lower interest for higher biodiversity scores).
💰 **Automated Disbursements**: Funds released in tranches upon metric milestones, reducing default risks.
🔍 **Transparent Verification**: Use oracles to input real-world data like satellite imagery or sensor readings for immutable proof.
📈 **Token Rewards**: Farmers earn governance tokens for sustained regenerative practices, usable for voting or staking.
🤝 **Multi-Party Collaboration**: Involves farmers, lenders, verifiers (e.g., NGOs or auditors), and supply chain buyers.
📊 **Real-Time Reporting**: Dashboards for tracking loan performance and environmental impact.
⚖️ **Decentralized Governance**: Community voting on loan parameters and oracle integrations.
🚫 **Fraud Prevention**: Immutable records prevent metric tampering and ensure unique farm registrations.

## 🛠 How It Works

RegenFinance leverages the Stacks blockchain for secure, scalable operations. All smart contracts are written in Clarity, ensuring safety and predictability. The system starts with farm registration and metric baselines, then progresses to loan origination, ongoing verification, and performance-based adjustments.

### Smart Contracts Overview
The project is built around 8 interconnected Clarity smart contracts:

1. **UserRegistry.clar**: Handles registration of farmers, lenders, verifiers, and buyers. Stores profiles with principal addresses, farm details (e.g., location hashes), and roles. Prevents duplicates via unique IDs.
2. **BiodiversityOracle.clar**: Integrates with external oracles to submit and validate biodiversity metrics (e.g., biodiversity index scores). Uses timestamps and signatures for authenticity.
3. **LoanFactory.clar**: Creates customizable loan agreements with terms linked to metrics (e.g., "disburse 20% if biodiversity score > 80"). Manages loan states like active, paused, or defaulted.
4. **EscrowVault.clar**: Holds loaned funds (in STX or SIP-10 tokens) in escrow, releasing them based on metric verifications from the oracle.
5. **PaymentProcessor.clar**: Automates repayments, interest calculations, and adjustments. For example, reduces interest if metrics improve over time.
6. **GovernanceToken.clar**: Issues ERC-20-like tokens (SIP-10 compliant) for rewards. Farmers stake tokens for bonuses or vote on proposals.
7. **VerificationEngine.clar**: Cross-checks submitted metrics against baselines and thresholds. Emits events for approvals or disputes.
8. **ReportingDashboard.clar**: Aggregates data from other contracts for queries, like total loaned amounts or average biodiversity gains. Supports off-chain integrations for visualizations.

### For Farmers
- Register your farm via UserRegistry.clar, providing a geohash and initial biodiversity baseline.
- Apply for a loan by calling LoanFactory.clar with requested amount, terms, and metric goals (e.g., "increase soil diversity by 15% in 6 months").
- Submit periodic metrics through verifiers to BiodiversityOracle.clar.
- Upon verification (via VerificationEngine.clar), funds are released from EscrowVault.clar, and you earn tokens from GovernanceToken.clar.
- Repay via PaymentProcessor.clar, with potential interest rebates for exceeding metrics.

Boom! Your regenerative practices get funded while proving real impact.

### For Lenders
- Register in UserRegistry.clar and fund loans by transferring to EscrowVault.clar.
- Monitor loans via ReportingDashboard.clar and get notified of metric updates.
- Benefit from automated adjustments—e.g., higher yields if biodiversity metrics hit targets, reducing risk.

### For Verifiers (e.g., Auditors or NGOs)
- Register and get approved in UserRegistry.clar.
- Use BiodiversityOracle.clar to submit verified data (e.g., from drones or labs).
- Call VerificationEngine.clar to confirm data integrity and trigger events.

### For Supply Chain Buyers (Optional)
- Query ReportingDashboard.clar to verify farm metrics before purchasing produce.
- Participate in governance via GovernanceToken.clar to influence sustainable sourcing rules.

That's it! A fully decentralized system that aligns financial incentives with planetary health. Deploy on Stacks testnet to start, and scale with real oracles like Chainlink for production.