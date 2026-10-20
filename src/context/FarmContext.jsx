import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from './AuthContext.jsx';

const FarmCtx = createContext(null);
export const useFarm = () => useContext(FarmCtx);

const STORAGE_KEY = 'refet.activeFarm';

/**
 * Knows which farm's data is on screen: the user's own, or one that was shared with them.
 * Also loads the profile and the category list of the active farm.
 */
export function FarmProvider({ children }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [sharedFarms, setSharedFarms] = useState([]); // [{ owner_id, role, name }]
  const [ownerId, setOwnerId] = useState(user.id);
  const [ownerProfile, setOwnerProfile] = useState(null);
  const [categories, setCategories] = useState([]);

  const loadProfile = useCallback(async () => {
    let { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (!data) {
      await supabase.rpc('ensure_my_profile');
      ({ data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle());
    }
    setProfile(data);
    return data;
  }, [user.id]);

  const loadFarms = useCallback(async () => {
    const { data: shares } = await supabase.from('farm_members').select('owner_id, role').neq('owner_id', user.id);
    const ids = (shares || []).map((s) => s.owner_id);
    let names = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, farm_name, full_name, email').in('id', ids);
      names = Object.fromEntries(
        (profs || []).map((p) => [p.id, p.farm_name || (p.full_name ? `החווה של ${p.full_name}` : p.email) || 'חווה משותפת']),
      );
    }
    const list = (shares || []).map((s) => ({ ...s, name: names[s.owner_id] || 'חווה משותפת' }));
    setSharedFarms(list);
    return list;
  }, [user.id]);

  const loadCategories = useCallback(async (owner) => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('owner_id', owner)
      .order('type')
      .order('name');
    setCategories(data || []);
  }, []);

  // initial load
  useEffect(() => {
    let off = false;
    (async () => {
      await loadProfile();
      const farms = await loadFarms();
      if (off) return;
      const saved = localStorage.getItem(STORAGE_KEY);
      setOwnerId(saved && farms.some((f) => f.owner_id === saved) ? saved : user.id);
      setReady(true);
    })().catch(() => setReady(true));
    return () => {
      off = true;
    };
  }, [user.id, loadProfile, loadFarms]);

  // categories + owner profile follow the active farm
  useEffect(() => {
    if (!ready) return;
    loadCategories(ownerId);
    if (ownerId === user.id) setOwnerProfile(profile);
    else supabase.from('profiles').select('*').eq('id', ownerId).maybeSingle().then(({ data }) => setOwnerProfile(data));
  }, [ready, ownerId, user.id, profile, loadCategories]);

  const switchFarm = useCallback(
    (id) => {
      setOwnerId(id);
      try {
        if (id === user.id) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* storage unavailable */
      }
    },
    [user.id],
  );

  const isOwner = ownerId === user.id;
  const role = isOwner ? 'owner' : sharedFarms.find((f) => f.owner_id === ownerId)?.role || 'viewer';

  const value = useMemo(
    () => ({
      ready,
      profile,
      ownerId,
      ownerProfile,
      isOwner,
      role,
      canWrite: role === 'owner' || role === 'editor',
      sharedFarms,
      switchFarm,
      categories,
      farmName:
        ownerProfile?.farm_name ||
        (isOwner ? profile?.farm_name : sharedFarms.find((f) => f.owner_id === ownerId)?.name) ||
        'החווה שלי',
      reloadCategories: () => loadCategories(ownerId),
      reloadProfile: loadProfile,
      reloadFarms: loadFarms,
    }),
    [ready, profile, ownerId, ownerProfile, isOwner, role, sharedFarms, switchFarm, categories, loadCategories, loadProfile, loadFarms],
  );

  return <FarmCtx.Provider value={value}>{children}</FarmCtx.Provider>;
}
