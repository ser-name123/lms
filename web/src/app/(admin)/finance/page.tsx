"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  CreditCard,
  Receipt,
  GraduationCap,
  RotateCcw,
  AlertTriangle,
  Users,
  FileText,
  PieChart as PieIcon,
  BarChart3,
  Loader2,
  ArrowUpRight,
  Globe,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { fetchFinanceDashboard } from "@/lib/api";

const CHART_COLORS = [
  "#386FA4", // Blue
  "#10b981", // Green
  "#f59e0b", // Amber
  "#f85a6b", // Rose
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#6b7280", // Gray
];

interface FinanceCards {
  totalRevenue: number;
  collectedToday: number;
  collectedThisMonth: number;
  pendingFees: number;
  outstandingBalance: number;
  refunds: number;
  scholarships: { count: number; amount: number };
  teacherPayroll: { paid: number; pending: number };
  expenses: number;
  netProfit: number;
  overdueInvoices: number;
}

interface CurrencyLine {
  currency: string;
  totalRevenue: number;
  collectedThisMonth: number;
  outstanding: number;
  isReportingCurrency: boolean;
}

interface FinanceDashboard {
  currency: string;
  /** Revenue per currency invoiced in — never summed, never converted. */
  byCurrency: CurrencyLine[];
  cards: FinanceCards;
  charts: {
    revenueSeries: { month: string; revenue: number }[];
    profitTrend: { month: string; revenue: number; expense: number; profit: number }[];
    courseWise: { label: string; amount: number }[];
    countryWise: { label: string; amount: number }[];
    methodDist: { method: string; amount: number; count: number }[];
  };
}

export default function FinanceDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<FinanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinanceDashboard()
      .then((res) => setData(res as FinanceDashboard))
      .catch((err) => console.error("Failed to load finance dashboard", err))
      .finally(() => setLoading(false));
  }, []);

  const currency = data?.currency ?? "$";
  const money = (n: number | null | undefined) =>
    `${currency} ${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const moneyIn = (n: number | null | undefined, cur: string) =>
    `${cur} ${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  /*
   * Every card and chart below is the reporting currency alone. Revenue billed
   * in another currency is real money and must not vanish from the screen just
   * because it cannot be added to the rest — it gets its own row, unconverted.
   * Hidden until a second currency exists, so the usual single-currency academy
   * sees no extra furniture.
   */
  const otherCurrencies = (data?.byCurrency ?? []).filter((l) => !l.isReportingCurrency);

  const c = data?.cards;
  const ch = data?.charts;

  return (
    <>
      <Topbar title="Finance Dashboard" subtitle="Unified view of revenue, collections, payroll, and profitability" />

      <div className="animate-fade-up p-4 sm:p-6 space-y-6">

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <Button
            variant="ghost"
            onClick={() => router.push("/finance/invoices")}
            className="bg-surface border border-hairline font-bold text-xs h-10 px-5 py-2.5 rounded-xl flex items-center gap-1.5"
          >
            <FileText className="size-4" />
            Invoices
          </Button>
          <Button
            variant="primary"
            onClick={() => router.push("/finance/reports")}
            className="hover:shadow-lg font-bold text-xs h-10 px-5 py-2.5 rounded-xl flex items-center gap-1.5"
          >
            <BarChart3 className="size-4" />
            Reports &amp; Settings
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-24 text-sm font-bold text-ink-3">
            <Loader2 className="size-5 animate-spin mr-2 text-accent" />
            Loading finance overview...
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center justify-center py-24 text-ink-3 gap-2">
            <AlertTriangle className="size-8 text-ink-3/40" />
            <p className="font-bold text-sm">No finance data available.</p>
            <p className="text-xs">Once invoices and payments are recorded, insights will appear here.</p>
          </div>
        ) : (
          <>
            {otherCurrencies.length > 0 && (
              <Card className="border border-hairline bg-surface shadow-sm p-4 sm:p-5">
                <div className="flex items-start gap-2 mb-3">
                  <Globe className="size-4 text-accent mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-xs font-extrabold text-ink">Revenue billed in other currencies</h3>
                    <p className="text-[11px] text-ink-3 mt-0.5">
                      The cards and charts below are {currency} only. These amounts are shown as
                      billed — the academy stores no exchange rate, so they are never added to the {currency} totals.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {otherCurrencies.map((line) => (
                    <div key={line.currency} className="rounded-xl border border-hairline bg-surface-2/30 px-4 py-3">
                      <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">
                        {line.currency}
                      </span>
                      <p className="text-sm font-black text-ink mt-1">{moneyIn(line.totalRevenue, line.currency)}</p>
                      <p className="text-[10px] text-ink-3 mt-1">
                        {moneyIn(line.collectedThisMonth, line.currency)} this month ·{" "}
                        {moneyIn(line.outstanding, line.currency)} outstanding
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* KPI Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 select-none">
              <StatCard label="Total Revenue" value={money(c?.totalRevenue)} icon={DollarSign} color="text-emerald-500 bg-emerald-500/10" />
              <StatCard label="Collected Today" value={money(c?.collectedToday)} icon={Wallet} color="text-blue-500 bg-blue-500/10" />
              <StatCard label="Collected This Month" value={money(c?.collectedThisMonth)} icon={TrendingUp} color="text-accent bg-accent/10" />
              <StatCard label="Net Profit" value={money(c?.netProfit)} icon={TrendingUp} color="text-emerald-500 bg-emerald-500/10" caption={`${currency} revenue minus expenses & payroll`} />
              <StatCard label="Pending Fees" value={money(c?.pendingFees)} icon={Clock} color="text-amber-500 bg-amber-500/10" />
              <StatCard label="Outstanding Balance" value={money(c?.outstandingBalance)} icon={AlertTriangle} color="text-rose-500 bg-rose-500/10" />
              <StatCard label="Expenses" value={money(c?.expenses)} icon={TrendingDown} color="text-rose-500 bg-rose-500/10" />
              <StatCard
                label="Teacher Payroll"
                value={money(c?.teacherPayroll?.paid)}
                icon={Users}
                color="text-violet-500 bg-violet-500/10"
                caption={`${money(c?.teacherPayroll?.pending)} pending`}
              />
              <StatCard label="Refunds" value={money(c?.refunds)} icon={RotateCcw} color="text-orange-500 bg-orange-500/10" />
              <StatCard
                label="Scholarships"
                value={money(c?.scholarships?.amount)}
                icon={GraduationCap}
                color="text-cyan-500 bg-cyan-500/10"
                caption={`${c?.scholarships?.count ?? 0} awarded`}
              />
              <StatCard label="Overdue Invoices" value={String(c?.overdueInvoices ?? 0)} icon={Receipt} color="text-rose-500 bg-rose-500/10" caption="Invoices past due date" />
            </div>

            {/* Monthly Revenue (Area) */}
            <ChartCard
              title="Monthly Revenue"
              subtitle="Collected revenue across the last 12 months"
              icon={<TrendingUp className="size-4.5 text-accent" />}
            >
              {(ch?.revenueSeries?.length ?? 0) === 0 ? (
                <EmptyChart />
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ch?.revenueSeries} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="finRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#386FA4" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#386FA4" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} />
                      <YAxis tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} />
                      <Tooltip
                        formatter={(value: any) => [money(value), "Revenue"]}
                        contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--ink)", fontSize: "12px" }}
                        labelStyle={{ fontWeight: "bold" }}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#386FA4" strokeWidth={2.5} fillOpacity={1} fill="url(#finRev)" name="Revenue" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            {/* Profit Trend (Composed) */}
            <ChartCard
              title="Profit Trend"
              subtitle="Revenue vs expense vs profit over the last 6 months"
              legend={
                <>
                  <LegendDot color="#386FA4" label="Revenue" />
                  <LegendDot color="#f85a6b" label="Expense" />
                  <LegendDot color="#10b981" label="Profit" />
                </>
              }
            >
              {(ch?.profitTrend?.length ?? 0) === 0 ? (
                <EmptyChart />
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={ch?.profitTrend} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} />
                      <YAxis tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} />
                      <Tooltip
                        formatter={(value: any, name: any) => [money(value), name]}
                        contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--ink)", fontSize: "12px" }}
                        labelStyle={{ fontWeight: "bold" }}
                      />
                      <Bar dataKey="revenue" fill="#386FA4" radius={[4, 4, 0, 0]} name="Revenue" barSize={18} />
                      <Bar dataKey="expense" fill="#f85a6b" radius={[4, 4, 0, 0]} name="Expense" barSize={18} />
                      <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} name="Profit" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            {/* Course-wise + Country-wise + Method distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 select-none">
              {/* Course-wise Revenue (Bar) */}
              <ChartCard
                title="Course-wise Revenue"
                subtitle="Top revenue-generating courses"
                icon={<BarChart3 className="size-4.5 text-accent" />}
              >
                {(ch?.courseWise?.length ?? 0) === 0 ? (
                  <EmptyChart />
                ) : (
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ch?.courseWise} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                        <XAxis type="number" tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} />
                        <YAxis type="category" dataKey="label" width={90} tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} />
                        <Tooltip
                          formatter={(value: any) => [money(value), "Revenue"]}
                          contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--ink)", fontSize: "12px" }}
                        />
                        <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={16}>
                          {(ch?.courseWise ?? []).map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>

              {/* Country-wise Revenue (Bar) */}
              <ChartCard
                title="Country-wise Revenue"
                subtitle="Revenue distribution by country"
                icon={<BarChart3 className="size-4.5 text-accent" />}
              >
                {(ch?.countryWise?.length ?? 0) === 0 ? (
                  <EmptyChart />
                ) : (
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ch?.countryWise} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} interval={0} angle={-15} textAnchor="end" height={44} />
                        <YAxis tickLine={false} axisLine={false} style={{ fontSize: "10px", fontWeight: "bold" }} />
                        <Tooltip
                          formatter={(value: any) => [money(value), "Revenue"]}
                          contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--ink)", fontSize: "12px" }}
                        />
                        <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={22}>
                          {(ch?.countryWise ?? []).map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>

              {/* Payment Method Distribution (Donut) */}
              <ChartCard
                title="Payment Method"
                subtitle="Distribution across payment gateways"
                icon={<PieIcon className="size-4.5 text-accent" />}
              >
                {(ch?.methodDist?.length ?? 0) === 0 ? (
                  <EmptyChart />
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="h-[180px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={ch?.methodDist}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={3}
                            dataKey="amount"
                            nameKey="method"
                          >
                            {(ch?.methodDist ?? []).map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: any, _n: any, entry: any) => [money(value), entry?.payload?.method]}
                            contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--ink)", fontSize: "10px" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full mt-4 grid grid-cols-2 gap-2 text-[10px] font-bold text-ink-3">
                      {(ch?.methodDist ?? []).slice(0, 6).map((item, idx) => (
                        <div key={item.method} className="flex items-center gap-1.5 truncate">
                          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                          <span className="truncate">{item.method}:</span>
                          <span className="text-ink font-extrabold">{money(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  caption,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  caption?: string;
}) {
  return (
    <Card className="overflow-hidden border border-hairline bg-surface shadow-sm hover:shadow-md transition-shadow relative">
      <CardBody className="p-5 flex flex-col justify-between h-[125px]">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="size-5" />
          </div>
          <span className="text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">{label}</span>
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-ink tracking-tight Outfit leading-none">{value}</h2>
          <p className="text-[10px] font-medium text-ink-3 mt-1.5">{caption ?? " "}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  legend,
  children,
}: {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm overflow-hidden select-none">
      <div className="border-b border-hairline px-5 py-4 bg-surface-2/30 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-ink uppercase tracking-wider">{title}</h4>
          <p className="text-[10px] text-ink-3 mt-0.5">{subtitle}</p>
        </div>
        {legend ? <div className="flex items-center gap-3 text-[10px] font-bold text-ink-3">{legend}</div> : icon}
      </div>
      <CardBody className="p-4">{children}</CardBody>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}

function EmptyChart() {
  return <div className="grid h-[240px] place-items-center text-xs font-bold text-ink-3">No data available yet.</div>;
}
