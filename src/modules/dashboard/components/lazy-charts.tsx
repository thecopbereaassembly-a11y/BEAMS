"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/primitives";

/**
 * Recharts is ~100 kB — larger than the rest of the dashboard combined. Loading
 * it eagerly blew the performance budget (docs/01 §7: P75 interactive < 2.5s on
 * 3G), so the charts are code-split and stream in after the shell paints.
 *
 * The skeleton matches the chart height exactly, so there is no layout shift.
 */
const ChartFallback = () => <Skeleton className="h-56 w-full" />;

export const AttendanceChart = dynamic(
  () => import("./charts").then((m) => m.AttendanceChart),
  { ssr: false, loading: ChartFallback },
);

export const GrowthChart = dynamic(
  () => import("./charts").then((m) => m.GrowthChart),
  { ssr: false, loading: ChartFallback },
);
