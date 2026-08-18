"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export function useKpcBalance(userId: string | null, ownerType: "user" | "vault" = "user") {
  const [balance, setBalance] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setBalance(null);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchInitial = async () => {
      // maybeSingle, not single: a 'vault' account may not exist yet for
      // this user (it's created lazily on first vault deposit), and that
      // absence should read as a zero balance, not a fetch error.
      const { data, error } = await supabase
        .from("accounts")
        .select("id, balance")
        .eq("user_id", userId)
        .eq("currency", "KPC")
        .eq("owner_type", ownerType)
        .maybeSingle();

      if (!isMounted) return;
      if (error) {
        console.error("Failed to fetch KPC balance:", error);
        setLoading(false);
        return;
      }
      if (!data) {
        setAccountId(null);
        setBalance(0);
        setLoading(false);
        return;
      }
      setAccountId(data.id);
      setBalance(Number(data.balance));
      setLoading(false);
    };

    fetchInitial();

    const channel = supabase
      .channel(`kpc-balance-${userId}-${ownerType}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "accounts",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // user_id alone is no longer unique per row — a user can have
          // BOTH a 'user' account and a 'vault' account now. Must also
          // check owner_type here, or an update to one silently overwrites
          // the balance shown for the other.
          if (payload.new.currency === "KPC" && payload.new.owner_type === ownerType) {
            setBalance(Number(payload.new.balance));
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId, ownerType]);

  return { balance, accountId, loading };
}