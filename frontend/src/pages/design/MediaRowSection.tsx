import { parseEther } from 'viem'
import {
  AddressDisplay,
  Button,
  MediaRow,
  Notice,
  SourceBlock,
  TokenAmount,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

const SRC_MEDIA_ROW =
  `<ul className="ds-stack ds-stack-0">
  <MediaRow
    as="li"
    leading={<span className="ds-glyph">↓</span>}
    title="Deposit confirmed"
    meta="2m ago · 0xabcd…1234"
    trailing={<TokenAmount amount={parseEther('1.5')} decimals={18} symbol="ETH" />}
  />
  <MediaRow
    as="li"
    tone="warn"
    leading={<span className="ds-glyph">!</span>}
    title="Forfeit execution delay active"
    meta="nominally matures in 3h · arbiter 0xdead…beef"
    trailing={<Button size="sm">Review</Button>}
  />
  <MediaRow
    as="li"
    tone="danger"
    density="compact"
    leading={<span className="ds-glyph">✗</span>}
    title="Position forfeited"
    meta="block 21,401,228"
    trailing="−0.42 ETH"
  />
</ul>`

const SRC_MEDIA_ROW_ACTION =
  `<MediaRow
  as="li"
  tone="warn"
  leading={<span className="ds-glyph">!</span>}
  title="Forfeit proposed on commitment #28"
  meta={<span>with <AddressDisplay address={counterparty} /></span>}
  trailing={<span className="ds-text-xs ds-subtle">Review →</span>}
  action={{ label: 'Review commitment #28', onClick: () => open(28) }}
/>

// href instead of onClick renders the overlay as an anchor:
<MediaRow as="li" title="USDC Vault" action={{ label: 'Open USDC Vault', href: '/app/vaults/0xabc' }} />`

export function MediaRowSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="media-row"
        title="Media Row"
        lead="Generic list-item primitive — leading slot, title, meta line, trailing slot. Use it as the rendering surface for activity feeds, proposal lists, and operator lists. No protocol vocabulary inside."
      />
      <ul className="ds-stack ds-stack-0" style={{ border: 'var(--border-width) solid var(--border)', listStyle: 'none', padding: 0, margin: 0 }}>
        <MediaRow
          as="li"
          leading={<span className="ds-glyph">↓</span>}
          title="Deposit confirmed"
          meta="2m ago · 0xabcd…1234"
          trailing={<TokenAmount amount={parseEther('1.5')} decimals={18} symbol="ETH" />}
        />
        <MediaRow
          as="li"
          tone="info"
          leading={<span className="ds-glyph">i</span>}
          title="Withdrawal queued"
          meta="unbond ready in 7d"
          trailing={<TokenAmount amount={parseEther('0.4')} decimals={18} symbol="ETH" />}
        />
        <MediaRow
          as="li"
          tone="warn"
          leading={<span className="ds-glyph">!</span>}
          title="Forfeit execution delay active"
          meta="nominally matures in 3h · arbiter 0xdead…beef"
          trailing={<Button size="sm">Review</Button>}
        />
        <MediaRow
          as="li"
          tone="success"
          leading={<span className="ds-glyph">✓</span>}
          title="Yield distributed"
          meta="block 21,401,201"
          trailing={<TokenAmount amount={parseEther('0.012')} decimals={18} symbol="ETH" />}
        />
        <MediaRow
          as="li"
          tone="danger"
          density="compact"
          leading={<span className="ds-glyph">✗</span>}
          title="Position forfeited"
          meta="block 21,401,228"
          trailing="−0.42 ETH"
        />
      </ul>
      <SourceBlock label="example" source={SRC_MEDIA_ROW} />

      <div className="ds-stack ds-stack-3">
        <h3 className="ds-section-title">Rows that activate</h3>
        <p className="ds-text-sm ds-subtle" style={{ maxWidth: '64ch', margin: 0 }}>
          Pass <code>action</code> to make the whole row clickable. The root
          element stays a <code>div</code> or <code>li</code> and the action
          becomes an invisible overlay filling the row, so a row whose slots
          carry their own controls — the copy button inside an address, a
          badge that links out — is still valid HTML and still reachable by
          keyboard. Never reach for <code>as=&quot;button&quot;</code>; it is
          gone for exactly that reason.
        </p>
        <Notice tone="info" size="sm" title="label is not optional">
          The overlay has no text of its own, so <code>action.label</code> is
          the only accessible name the row action gets. Write the sentence a
          screen-reader user needs (&ldquo;Review commitment #28&rdquo;), not
          a bare verb.
        </Notice>
        <ul className="ds-stack ds-stack-0" style={{ border: 'var(--border-width) solid var(--border)', listStyle: 'none', padding: 0, margin: 0 }}>
          <MediaRow
            as="li"
            tone="warn"
            leading={<span className="ds-glyph">!</span>}
            title="Forfeit proposed on commitment #28"
            meta={
              <span>
                with <AddressDisplay address="0x15d34aaf54267db7d7c367839aaf71a00a2c6a65" />
              </span>
            }
            trailing={<span className="ds-text-xs ds-subtle">Review →</span>}
            action={{ label: 'Review commitment #28' }}
          />
          <MediaRow
            as="li"
            leading={<span className="ds-glyph">↓</span>}
            title="Deposit confirmed"
            meta="2m ago"
            trailing={<TokenAmount amount={parseEther('1.5')} decimals={18} symbol="ETH" />}
            action={{ label: 'Open deposit from 2 minutes ago' }}
          />
        </ul>
        <p className="ds-text-xs ds-subtle" style={{ maxWidth: '64ch', margin: 0 }}>
          The copy button on that address is clickable, and tabbing through
          reaches the row action first and the copy button second. Text
          inside an actionable row cannot be selected with the mouse, which
          is the accepted cost of the pattern.
        </p>
        <SourceBlock label="example" source={SRC_MEDIA_ROW_ACTION} />
      </div>
    </section>
  )
}
