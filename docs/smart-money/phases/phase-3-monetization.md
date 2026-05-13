# Phase 3 - Monetization and Controls

Status: Not started
Target: Add paid controls and safe progressive rollout for Smart Money actions

## Scope

- Add subscription-based gating for selected Smart Money capabilities
- Add rollout and experimentation controls for safer release tuning

## In Scope Deliverables

### Monetization
- Add-to-auto-trading action gated by subscription plan
- Dashboard browsing remains available for all users
- Upgrade path messaging integrated in blocked actions

### Controls
- Environment-configurable thresholds and toggles
- Percentage rollout controls for feature exposure
- A/B toggles for threshold strictness

## Implementation Checklist

### Subscription and Access
- [ ] Verify user subscription status during auto-trading action
- [ ] Return actionable blocked response with upgrade metadata
- [ ] Render paywall or upgrade CTA in UI when blocked

### Rollout
- [ ] Add feature flags for endpoint and UI surfaces
- [ ] Add percentage-based rollout support
- [ ] Add safe default fallback when flags are missing

### Experimentation
- [ ] Add experiment bucket key for strict vs baseline tier thresholds
- [ ] Log bucket in smart_money_actions for analysis
- [ ] Protect users from unstable behavior with kill switch

### Operational Readiness
- [ ] Add dashboards/alerts for gate errors and conversion events
- [ ] Verify rollback path for all new controls

## Exit Criteria

- [ ] Gating behavior validated across subscription tiers
- [ ] Conversion and retention metrics tracked
- [ ] Rollout controls can be tuned without redeploy
- [ ] Kill switch tested end-to-end

## Risks and Mitigations

- Risk: user confusion when blocked from auto action
  - Mitigation: clear messaging and one-click upgrade path
- Risk: experimentation causes inconsistent UX
  - Mitigation: sticky bucketing and documented behavior
