import { useInventory, StoreItem } from "../../state/inventory";

function ItemCard({ item }: { item: StoreItem }) {
  const { buy, isOwned, equip, equipped } = useInventory((s) => ({
    buy: s.buy,
    isOwned: s.isOwned,
    equip: s.equip,
    equipped: s.equipped,
  }));

  const owned = isOwned(item.id);
  const isEquipped = equipped[item.slot] === item.id;

  function onBuy() {
    const res = buy(item.id);
    if (!res.ok) alert(res.reason ?? "Could not buy.");
  }

  function onEquip() {
    equip(item.id);
  }

  return (
    <div className="card">
      <div className="row1">
        <div className="emoji">{item.emoji ?? "🧩"}</div>
        <div className="meta">
          <div className="name">{item.name}</div>
          <div className="sub">
            <span>{item.slot}</span> • <span>{item.rarity}</span>
          </div>
        </div>
        <div className="price">{item.price.toLocaleString()}c</div>
      </div>

      <div className="row2">
        {!owned ? (
          <button className="primary" onClick={onBuy}>Buy</button>
        ) : isEquipped ? (
          <button className="ghost" disabled>Equipped</button>
        ) : (
          <button className="ghost" onClick={onEquip}>Equip</button>
        )}
      </div>

      <style>{`
        .card{
          background:#111a2d; border:1px solid rgba(255,255,255,.08);
          border-radius:12px; padding:10px;
          display:flex; flex-direction:column; gap:10px;
        }
        .row1{ display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:center; }
        .emoji{ font-size:24px; }
        .meta .name{ font-weight:700; }
        .sub{ font-size:12px; color:#9fb0c7; }
        .price{ color:#ffd47a; font-weight:800; }
        .row2{ display:flex; justify-content:flex-end; }
        .ghost{
          background:transparent; border:1px solid rgba(255,255,255,.12);
          color:#e6edf7; border-radius:10px; padding:8px 12px; cursor:pointer;
        }
      `}</style>
    </div>
  );
}

export default function StorePanel() {
  const { catalog } = useInventory((s) => ({ catalog: s.catalog }));

  return (
    <div className="store">
      <h3>Store</h3>
      <p className="muted small">Cosmetics only • Coins only</p>

      <div className="grid">
        {catalog.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>

      <style>{`
        .store{ display:flex; flex-direction:column; gap:12px; }
        .grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:10px; }
      `}</style>
    </div>
  );
}
