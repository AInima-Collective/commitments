# Commitments
## On-chain indemnity: enforceable agreements backed by productive capital.

Communities trying to organize around shared goals face a fundamental challenge: how do you make agreements that actually hold? Today, coordination relies on trust between people who may not know each other, promises that can't be enforced, and funding that depends on continued goodwill.

When agreements are informal, they break down. When they require intermediaries like banks, lawyers, or platforms, they become expensive, slow, and exclusionary.

Communities need a way to put something on the line. Not because everyone is untrustworthy, but because the agreements that matter (coverage when someone gets hurt, support for an operator running critical infrastructure, a treaty between two DAOs, a yield-share donation to a public good) work better when the consequences of breaking them are clear in advance and don't require chasing anyone afterward.

The closest tools we have today are restaking, escrow contracts, and bonded promises in DAO governance. Each works for a narrow slice. Each requires the parties to lose access to their capital while the agreement is in force. Each is welded to its specific use case, so a forfeiture condition built for one system can't back a different kind of arrangement. The result is that most on-chain coordination still happens through ad-hoc trust, off-chain reputation, and tokens-as-bondings that nobody quite knows how to enforce.

Commitments is one primitive for all of them: on-chain indemnity, backed by capital that keeps earning while it stands, paid out if the agreement breaks, enforced by whoever the parties pick to decide.

---

## What a commitment is

A commitment is on-chain indemnity: capital pledged to make a counterparty whole if a defined condition is met. The capital keeps earning the whole time it stands behind the promise.

Indemnity is the oldest shape of a serious agreement: *I will cover your loss if this goes wrong.* It's what an insurer sells, what a surety bond guarantees, what a slashing condition enforces, what one party offers another to make a deal safe to enter. What those have in common isn't the industry. It's the structure: capital set aside to absorb a defined harm, payable to the party who suffers it, on terms fixed in advance. A commitment is that structure as a single on-chain primitive, with two properties the off-chain version can't usually offer: the capital is provably there, and it never stops working.

A depositor places capital under the protocol's custody. The backing can be any ERC-20 token; canonically it is a share of a yield-bearing vault, so the underlying capital keeps earning whatever the strategy produces. The depositor then agrees that, under conditions both sides define up front, some portion of that capital can be transferred to a counterparty by a designated arbiter.

The depositor specifies five things at creation:

- **Backing:** the amount and token standing behind the promise.
- **Arbiter:** the party authorized to release the commitment or trigger the transfer.
- **Counterparty:** optionally, the party that receives capital if the commitment is broken.
- **Maximum penalty:** the largest fraction of the depositor's backing the arbiter can take.
- **Timing:** the challenge window between when the arbiter announces a transfer and when it can happen (at least one day, configurable upward for higher-stakes agreements). The unbonding period for exit is not a per-commitment term: it is one value for the whole manager, set by its admin.

Ongoing value flows — an operator commission, an insurance premium, a yield-share donation — are not fields on the commitment. They attach as pluggable distribution strategies bound to it, so the same patterns are expressed without widening the primitive.

That's the agreement. Nothing else is implicit. The protocol enforces these rules; everything else (what counts as a breach, what good behavior looks like, what the counterparty does with the capital they receive) is decided by the parties or by the arbiter they pick.

## The capital keeps working

The depositor's capital stays productive throughout. When the backing is a yield-bearing vault share, it keeps earning whatever the vault produces. Putting it behind an agreement restricts when it can be moved; it doesn't pause what it earns.

This is the structural difference between commitments and most existing collateral systems. In restaking-style protocols, capital is locked into purpose-specific positions that may or may not earn. In escrow contracts, capital sits idle. In bonding curves, depositors trade away their capital to get back a token that represents the bond. Commitments are designed so that backing an agreement isn't a sacrifice. The same dollar can earn the yield it would have earned anyway and back a binding agreement at the same time.

This changes which kinds of agreements are economically feasible. A long-running insurance arrangement, a multi-year underwriting position, a treaty between DAOs that lasts as long as both DAOs exist: none of these work when the cost of backing is "your capital sits dead for the duration." They work fine when the cost is "your capital keeps earning, and if you break the agreement, some of it goes to the other side."

## Digital jurisdictions

Every agreement lives under some kind of authority. In the old world, that authority was usually a country: its courts, its laws, its remedies. Commitments let the parties pick instead. The arbiter named in the agreement is whoever they've agreed should decide, and the protocol doesn't care what kind of authority that is, only that the parties chose it. That choice is the most consequential one they make.

A jurisdiction can be:

- **An individual person**, for handshake agreements between parties who already trust each other.
- **A group of named people**, when several signers need to agree before any enforcement happens.
- **A community's governance process**, when the decision should go through a vote.
- **An oracle that publishes verifiable facts**, for agreements where the truth can be confirmed externally: a price, an outcome, a piece of public data.
- **A verifiable software service**, for agreements decided by code whose behavior is auditable and whose rulings are signed and accountable.
- **A panel of independent arbiters with a quorum rule**, when no single party should hold unilateral authority over the outcome.
- **A hybrid court**, where actual judges deliberate using modern tooling and issue rulings as signed transactions, combining the legitimacy and reasoning of a real judiciary with the speed and reach of on-chain enforcement.

Keeping the agreement separate from the authority that enforces it is what lets commitments stop being a restaking thing or an insurance thing or a governance thing. They become a shared substrate that any jurisdiction can run on: courts, services, panels, oracles, communities of subject experts. A single agreement picks the jurisdiction that fits its parties, its stakes, and what they want from whoever decides.

## Nothing moves without warning

When the arbiter decides to act on the commitment, the action happens in two phases. First, the arbiter announces it. No capital moves yet, but a public record opens. Then, after a challenge window of at least one day, the action can actually be carried out. The minimum is one day; parties can configure it longer for higher-stakes agreements.

During the window, anyone can react. The arbiter can change their mind. The depositor can dispute the action and seek escalation. A higher-authority arbiter, if one was named, can intervene. A counterparty-side review can take a closer look. This rules out flash decisions: every consequential action is visible in advance, with time for any party with reason to intervene to actually do so.

## You can always leave

If the arbiter goes offline, turns malicious, or loses control of their keys, the depositor doesn't lose access to their capital forever. They can announce their intention to exit, and after the manager's unbonding period passes, anyone can close the commitment and free the depositor's capital.

The arbiter keeps the right to act during the exit window: if the depositor genuinely misbehaved, the arbiter can still enforce before the exit completes. What the arbiter cannot do is block the exit by refusing to act. The depositor's path out doesn't depend on the arbiter's cooperation, only on the agreed waiting period elapsing. That's a guarantee most existing systems that lock capital don't provide.

## Promises that have to be backed

A lot of damage in finance follows one shape: someone promised more than they had, and the math was nowhere a counterparty could see it. Banks against deposits, exchanges against collateral, lenders against guarantees. The promises looked fine until the moment they didn't.

A commitment can't be created against capital that isn't there. Each commitment locks its backing out of the party's free balance, and the protocol rejects any new commitment that balance cannot cover. A party can split their backing across many agreements at different penalty levels. What they cannot do is pledge the same dollar twice.

Solvency is structural, not audited. There's no global ledger to reconcile, no quarterly report to trust. Anyone can read on-chain whether a party is backed for what they've pledged, and the rule applies the same way to an individual, a DAO treasury, an operator, or an insurance underwriter. The protocol doesn't recognize "trusted" parties that get to overdraw.

This is the difference between a commitment and a promise. A promise depends on the promisor's continued willingness and ability to make good. A commitment is backed the moment it's made, and the backing doesn't slip.

## The shape of the agreement

A commitment is the substrate two parties use to express their particular pattern of risk and reward, with the consequences specified upfront and enforced without an intermediary deciding after the fact.

The depositor's capital keeps earning whatever the underlying backing produces. That's the baseline, and it doesn't pause while the agreement is in force. On top of that baseline, the agreement directs flows in both directions. The depositor can send part of their upside to the counterparty: a commission paid to an operator, a premium paid to an underwriter, a donation streamed to a cause. The counterparty can route value back: a service fee, a coverage payout, an ecosystem reward. And the depositor accepts a bounded risk of loss: the maximum the arbiter can take if the agreement is breached, set at creation and visible from the start. That bounded loss is the indemnity at the core of the agreement, real capital standing behind the depositor's word. The flows in both directions are what the parties exchange around it.

What makes this self-enforcing is that none of these flows depend on either party staying cooperative after the agreement is in force. The terms are public, the consequences execute automatically, and the depositor's exit isn't conditional on anyone's goodwill.

Restaking, donation, insurance underwriting, operator commission: every relationship between two parties has a particular shape of risk and reward. Today they look like different systems. They don't need to be.

## When two parties commit to each other

Everything described so far is one-sided. The next composition is bilateral: two parties committing to each other.

A unilateral commitment is "I do X." An agreement is "we do X and Y": two linked commitments under a shared arbiter, where one side cannot release without the other and forfeiture either side runs through the same authority. The two sides do not need to commit to the same terms; each leg posts the backing token, amount, maximum penalty, and strategies that fit its side of the deal — the two legs can even be denominated in **different tokens** (one DAO's governance token against another's), and the protocol ties the lifecycle together across both.

This is the smallest unit of mutual obligation the protocol can express. The recurring examples are mutual aid between DAOs, junior-senior tranches where one side absorbs first losses and the other pays a coupon, validator buddy systems where two operators stake into each other to backstop liveness, two-party insurance where each side underwrites the other.

The amounts don't need to be symmetric. When party A commits 5,000 and party B commits 3,000, that ratio is itself a signal: visible on-chain, available to anyone reading the relationship.

## Composing institutions

Real institutions aren't built from two-party agreements in isolation. They're built from patterns where many people back one thing, one party backs many things, and different kinds of signal count for different amounts. The protocol gives communities a way to assemble these patterns from the same primitive, instead of inventing custom accounting each time.

Three shapes cover most of what institutions actually do.

**Many parties backing one thing.** An insurance fund where many underwriters share coverage. An operator running a service with many delegators behind them. A grant program funded by a coalition. Many commitments combine into one logical backing position while each contributor's stake stays legible.

**One party backing many things.** A treasury allocating across causes. A foundation funding multiple programs. An operator distributing delegated capital across sub-operations. The total can't exceed the party's actual backing: the same rule that applies to individuals applies to institutions, so a treasury can't double-commit its reserves.

**Different signals weighted differently.** A community decides what counts for how much. The signals can be economic: ETH-backed commitments may count more than stablecoin-backed ones, long-term commitments may count more than short-term ones. They don't have to be. Because the arbiter and the weighting layer don't care where a signal comes from, a community can weight economic backing alongside reputation, alongside contribution history, alongside identity, each entering the calculation as its own dimension, with its own weight, instead of all of it collapsing into "tokens at stake." The choice is explicit, on-chain, and visible to anyone whose position depends on it.

This last shape is the one that breaks commitments out of being only a capital protocol. Real trust isn't only about money. We trust people because of their reputation, the work they've put in over years, the contributions they've made to a community, the relationships they've kept. A system that recognizes only locked balances is informationally thin. Capital-backed enforcement on top of richer signals, where capital provides the leverage and reputation, contribution, or identity provide the trigger, is closer to the shape trust actually takes in the world.

These pieces compose. A pool can feed into another pool. A treasury can fund a fund-of-funds. Sub-organizations can back parent organizations. Whatever shape an institution takes, the underlying commitments stay individually visible, and anyone can trace where any piece of backing actually comes from.

This is what doesn't exist in traditional finance. You can audit a bank's books once a quarter and hope the snapshot was honest. With a graph of commitments, the institutional structure *is* the audit. Anyone can look at any time, and the math is enforced at every layer rather than only at the top.

## What this lets you build

The same primitive, used differently, expresses:

- **Backing for a decentralized service.** A network that needs operators it can trust (a service running off-chain compute, an oracle, a cross-chain validator set) can specify how operators back themselves and what counts as misbehavior. People who don't run the operations themselves can put their backing behind operators they trust and share in the service's revenue. The total backing across all operators is the service's security budget, readable by anyone.

- **Coverage against bad events.** An underwriter puts capital behind a class of claims. The insured party pays an ongoing premium. When the agreed conditions hit (a hack, a depeg, an outage), the arbiter releases capital to the insured. There's no insurance company in the middle, no claim forms to file, and no question about whether the underwriter is solvent.

- **Yield donations to causes you care about.** A depositor routes a share of their yield to a cause for as long as they want to. Their principal stays theirs, they can end the commitment at any time, and the cause receives ongoing support that's transparent and verifiable.

- **Treaties between two organizations.** Two DAOs make a binding agreement with each other. Each side puts something on the line. A neutral arbiter (a court, a dispute resolver, a joint multisig) decides whether the agreement held. Either both sides walk away together or neither side walks alone.

- **Agreements with and between agents.** An autonomous agent can be a party to a commitment: backing its own behavior, accepting backing from a principal, or arbitrating an agreement it can verify. A person hiring an agent to manage funds can put capital on the line that releases on success and forfeits on failure. As agents take on more economic roles, the agreements they make with each other and with the humans hiring them have to be real on both sides: capable of enforcement, not just statements of intent.

These aren't separate products. They're the same primitive, composed differently.

## Why it's inevitable

We are in the middle of a long transition in how humans coordinate. Communities that used to need a country to back them are forming across borders. Organizations are spinning up without legal incorporation. Agents acting on behalf of people are taking on real economic responsibilities. Treaties get drafted between groups that share goals but not jurisdictions.

The old coordination infrastructure assumes things that aren't true anymore. Banks assume regulated counterparties that stay reachable. Legal contracts assume access to courts that can compel performance. Insurance assumes a centralized pool with hired adjusters and a jurisdiction to sue them in. Most of the agreements people want to make now don't fit those assumptions, and most of the agreements machines will make on their behalf fit them even less.

What's needed isn't a replacement for the old infrastructure. It's a substrate that lets the parts of it that still work (courts, services, dispute resolvers, communities of subject experts) keep doing what they're good at, on infrastructure that fits the world we live in now. Capital that stays productive while it's at stake. Enforcement that doesn't depend on either party's continued cooperation. Recognition of who's trustworthy that doesn't flatten human judgment into a single token balance.

Commitments are one shape for that substrate. The protocol isn't the point. The shape is: indemnity backed by productive capital, enforced by whoever the parties pick, weighted by whatever signals a community recognizes. That shape is general enough to carry the agreements people are already making by hand, and the ones they will make as more of human and machine coordination moves on-chain.

What makes it feel inevitable isn't ambition. It's asymmetry. Productive capital outcompetes dormant capital. Self-enforcing agreements outcompete agreements that depend on chasing someone afterward. Books that can be read on-chain at any moment outcompete books that close once a quarter. None of these properties is going away. The things designed around them will outlast the things that weren't.

Most of this work will be invisible. The agreements built on commitments will compound quietly, and the communities, organizations, and agents that rely on them will coordinate at scales and across distances yesterday's intermediaries weren't built to serve. The people putting the agreements together won't always know what's underneath. That's how infrastructure is supposed to work.
