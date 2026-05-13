# Phase 2 - Integrations and Reporting

Status: Not started
Target: Integrate Smart Money into existing user surfaces and add measurable adoption analytics

## Scope

- Extend existing pages with Smart Money context
- Enhance ranking quality in luckmi picks
- Add action-level analytics and source attribution

## In Scope Deliverables

### Product Integrations
- Integrate SMS and tier context in stock detail experience
- Add optional SMS context in options opportunities
- Add SMS boost in luckmi picks ranking and filtering

### Data and Reporting
- Create smart_money_actions table (or migration script)
- Log smart-money-initiated actions
- Add reporting slices by source channel

## Implementation Checklist

### Stock Detail Integration
- [ ] Add Smart Money summary card to stock detail page
- [ ] Show SMS score, tier, and top supporting signals
- [ ] Add last updated timestamp and refresh behavior

### Options Integration
- [ ] Add optional underlying SMS field in opportunities response
- [ ] Render optional SMS badge in options opportunity cards
- [ ] Keep opportunities usable when SMS is unavailable

### Luckmi Picks Integration
- [ ] Add smartMoneyBoost function to rankScore
- [ ] Update filter logic to CTS or SMS thresholds
- [ ] Include SMS-related fields in response as optional

### Analytics
- [ ] Create and index smart_money_actions table
- [ ] Track action, symbol, score context, user id, timestamp
- [ ] Add initial admin metrics for adoption and conversion

### Compatibility
- [ ] All new fields are optional and non-breaking
- [ ] Legacy clients continue to work without updates

## Exit Criteria

- [ ] Integrations are live with no regression to existing flows
- [ ] Adoption metrics visible to admin users
- [ ] Updated API contracts documented
- [ ] QA verifies parity on unsupported SMS cases

## Risks and Mitigations

- Risk: extra latency on opportunities page
  - Mitigation: cache SMS and lazy-render optional badges
- Risk: noisy ranking changes in luckmi picks
  - Mitigation: guarded boost values and monitor win-rate deltas
