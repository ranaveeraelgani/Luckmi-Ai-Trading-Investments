# Phase 4 - Advanced Signals and Validation

Status: Not started
Target: Expand signal depth and validate quality with measurable outcome studies

## Scope

- Add insider and congressional signal channels when data is available
- Validate system quality through backtesting and comparative reporting
- Tune thresholds using measured outcomes

## In Scope Deliverables

### Advanced Signal Expansion
- Add insider signal scorer
- Add congressional signal scorer
- Recalibrate weighting and availability factor behavior

### Validation
- Build backtesting jobs for Smart Money vs baseline picks
- Publish report endpoint with tier-level performance metrics
- Produce threshold tuning recommendations from real outcomes

## Implementation Checklist

### Signals
- [ ] Define types and adapters for insider and congressional data
- [ ] Implement sub-score functions with tests
- [ ] Add missing-data and stale-data handling paths

### Scoring and Tiering
- [ ] Re-evaluate score bands for expanded signal set
- [ ] Verify tier boundaries against historical results
- [ ] Update narratives to explain new signal influence

### Backtesting
- [ ] Build replay job for historical candidate sets
- [ ] Compare outcomes: Smart Money vs CTS-only baseline
- [ ] Store and expose results via reporting endpoint

### Productization
- [ ] Add user-facing performance insights
- [ ] Add admin tuning panel inputs and guardrails
- [ ] Update docs and runbook for long-term maintenance

## Exit Criteria

- [ ] Advanced signals stable in production
- [ ] Backtesting report reviewed and approved
- [ ] Threshold updates documented and deployed
- [ ] Ongoing monitoring runbook complete

## Risks and Mitigations

- Risk: noisy or delayed advanced data sources
  - Mitigation: confidence caps and source availability penalties
- Risk: overfitting thresholds from limited history
  - Mitigation: holdout validation and rolling window checks
