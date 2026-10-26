"use client";

import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// The unit-price chart, in its own file so that recharts is not in the
// /invest bundle.
//
// WHY IT MOVED
//
// /invest was 292kB first load against roughly 180kB for every other page
// in the app. All of the difference was recharts, imported at the top of
// the page — and the chart only renders once there are three days of real
// prices to draw, which there are not yet.
//
// So every visitor was downloading 112kB of charting library to see a chart
// that does not appear. On mobile data that is somebody's money and several
// seconds, spent on nothing.
//
// Loaded through next/dynamic with ssr: false, recharts arrives only when
// there is actually a chart to draw. ssr: false is required because
// ResponsiveContainer measures the DOM.

export type Pricepoint = { instrument_id: string; day: string; unit_price: number };

const STROKES = ["#C9A84C", "#8FB8D4", "#2ECC71", "#9A8FC4"];

export default function PriceChart({
  series, ids,
}: {
  series: Record<string, string | number>[];
  ids: string[];
}) {
  return (
    <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-5 mb-5">
      <p className="text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em] mb-4">
        Unit price, last 90 days
      </p>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <XAxis dataKey="day" tick={{ fill: "#72727A", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#72727A", fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              contentStyle={{ background: "#16161C", border: "1px solid #26262E", borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: "#A0A0A8" }}
            />
            {ids.map((id, i) => (
              <Line key={id} type="monotone" dataKey={id} dot={false} strokeWidth={2}
                stroke={STROKES[i % STROKES.length]} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
