---
solvestack_version: 1
session_id: SS-SAMPLE-001
title: "Sample: intermittent DNS timeouts at a branch office"
status: resolved
system: "Branch VPN and internal DNS"
created: 2026-10-20T14:00:00.000Z
resolved: 2026-10-20T15:30:00.000Z
tags: ["dns", "vpn", "sample"]
---

# Sample: intermittent DNS timeouts at a branch office

## Problem
Users at one branch office see intermittent DNS lookup timeouts over the site-to-site VPN. This is an invented sample, not a real incident.

## Environment
Branch VPN and internal DNS

## Symptoms
Users at one branch office see intermittent DNS lookup timeouts over the site-to-site VPN. This is an invented sample, not a real incident.

## Key Findings
- Branch office users report web pages that fail to load for 5 to 10 seconds, then work on retry\. Head office users are not affected\.
- ;; connection timed out; no servers could be reached \(2 of 5 attempts\)
- Branch firewall log shows UDP 53 replies from 10\.20\.0\.53 dropped as fragmented packets over the VPN tunnel\.
- 50 of 50 test lookups from the branch succeeded after the MTU change\.

## Timeline
- **Observation** — Branch office users report web pages that fail to load for 5 to 10 seconds, then work on retry\. Head office users are not affected\. _(Oct 20, 2:02 PM)_
- **Action / Command** — nslookup intranet\.example\.internal 10\.20\.0\.53 _(Oct 20, 2:09 PM)_
- **Result / Command output** — ;; connection timed out; no servers could be reached \(2 of 5 attempts\) _(Oct 20, 2:10 PM)_
- **Evidence / Log** — Branch firewall log shows UDP 53 replies from 10\.20\.0\.53 dropped as fragmented packets over the VPN tunnel\. _(Oct 20, 2:31 PM)_
- **Action** — Lowered the tunnel MTU on the branch VPN interface from 1500 to 1400 in a change window\. _(Oct 20, 3:05 PM)_
- **Result** — 50 of 50 test lookups from the branch succeeded after the MTU change\. _(Oct 20, 3:20 PM)_
- **Decision** — Keep the 1400 MTU and add the setting to the branch VPN build checklist\. _(Oct 20, 3:28 PM)_

## Hypotheses
- **The internal DNS server is overloaded** — Ruled Out: Head office lookups to the same server never timed out, and server CPU stayed under normal load\.
- **The ISP link at the branch is dropping packets** — Ruled Out: Continuous ping across the tunnel showed no loss while lookups were failing\.
- **Large DNS replies are fragmented and dropped over the VPN** — Confirmed: Firewall log shows fragmented UDP 53 replies dropped, and lowering the MTU stopped the timeouts\.

## Ruled Out
- **The internal DNS server is overloaded** — Head office lookups to the same server never timed out, and server CPU stayed under normal load\.
- **The ISP link at the branch is dropping packets** — Continuous ping across the tunnel showed no loss while lookups were failing\.

## Root Cause
The branch VPN tunnel used a 1500 byte MTU, so larger DNS replies were fragmented and the branch firewall dropped the fragments.

## Resolution
Set the branch VPN interface MTU to 1400.

## Validation
50 of 50 test lookups succeeded after the change, and no timeouts were reported the next day.

## Prevention
Add the MTU value to the branch VPN build checklist and review other branches.

## Evidence
Not recorded
