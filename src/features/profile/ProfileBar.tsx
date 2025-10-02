import { useEffect, useState } from "react";
import { useProfile, useAge, useCoins } from "../../state/profile";

export default function ProfileBar() {
  const { profile, setProfile, updateProfile } = useProfile();
  const age = useAge();
  const coins = useCoins();

  // Local inputs (avoid typing lag in store)
  const [username, setUsername] = useState(profile?.username ?? "");
  const [birthday, setBirthday] = useState(profile?.birthday ?? "");
  const [gender, setGender] = useState(profile?.gender ?? "Prefer not to say");

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username);
    setBirthday(profile.birthday);
    setGender(profile.gender ?? "Prefer not to say");
  }, [profile]);

  function save() {
    const base = { username: username.trim(), birthday, gender };
    if (!profile) setProfile(base);
    else updateProfile(base);
  }

  return (
    <div className="pbar">
      <div className="row">
        <div className="grp">
          <label className="lbl">Username</label>
          <input
            className="inp"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Player123"
            maxLength={24}
          />
        </div>

        <div className="grp">
          <label className="lbl">Birthday</label>
          <input
            className="inp"
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            aria-label="Birthday"
          />
        </div>

        <div className="grp">
          <label className="lbl">Gender (optional)</label>
          <select
            className="inp"
            value={gender}
            onChange={(e) =>
              setGender(e.target.value as any)
            }
          >
            <option>Prefer not to say</option>
            <option>Male</option>
            <option>Female</option>
            <option>Non-binary</option>
            <option>Other</option>
          </select>
        </div>

        <div className="grp coins">
          <div className="lbl">Coins</div>
          <div className="coinsBadge">{coins.toLocaleString()}</div>
        </div>

        <div className="grp">
          <button className="primary" onClick={save}>Save</button>
        </div>
      </div>

      <div className="muted small">
        Age-band matchmaking: lobbies allow your age <strong>±1</strong>. {age == null ? "Set your birthday to compute age." : `Detected age: ${age}`}
      </div>

      <style>{`
        .pbar{
          display:flex; flex-direction:column; gap:6px;
          background:rgba(255,255,255,.03);
          border:1px solid rgba(255,255,255,.06);
          border-radius:12px; padding:10px;
        }
        .row{ display:grid; grid-template-columns: 1.2fr 1fr 1fr auto auto; gap:8px; align-items:end; }
        .grp{ display:flex; flex-direction:column; gap:6px; }
        .lbl{ font-size:12px; color:#9fb0c7; }
        .inp{
          background:#121a2c; color:#e6edf7; border-radius:10px;
          border:1px solid rgba(255,255,255,.08); padding:8px 10px; min-height:38px;
        }
        .coins{ align-items:flex-start; }
        .coinsBadge{
          display:inline-flex; align-items:center; justify-content:center;
          min-width:90px; height:38px; padding:0 12px;
          background:linear-gradient(90deg, #fde68a33, #f59e0b33);
          border:1px solid rgba(245,158,11,.45);
          border-radius:10px; font-weight:800; color:#ffd47a;
        }
        @media (max-width:980px){
          .row{ grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </div>
  );
}
