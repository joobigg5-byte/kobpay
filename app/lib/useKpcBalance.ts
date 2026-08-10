"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export function useKpcBalance(userId: string | null) {
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
      const { data, error } = await supabase
        .from("accounts")
        .select("id, balance")
        .eq("user_id", userId)
        .eq("currency", "KPC")
        .eq("owner_type", "user")
        .single();

      if (!isMounted) return;
      if (error) {
        console.error("Failed to fetch KPC balance:", error);
        setLoading(false);
        return;
      }
      setAccountId(data.id);
      setBalance(Number(data.balance));
      setLoading(false);
    };

    fetchInitial();

    const channel = supabase
      .channel(`kpc-balance-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "accounts",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new.currency === "KPC") {
            setBalance(Number(payload.new.balance));
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { balance, accountId, loading };
}