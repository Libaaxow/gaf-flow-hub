import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Brain, 
  Send, 
  RefreshCw, 
  TrendingUp, 
  DollarSign, 
  BarChart3,
  AlertTriangle,
  Lightbulb,
  LineChart,
  Loader2,
  Trash2
} from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface FinancialData {
  period: string;
  beginningBalance: number;
  totalRevenue: number;
  collectedAmount: number;
  outstandingAmount: number;
  totalExpenses: number;
  netProfit: number;
  recognizedProfit: number;
  pendingProfit: number;
  totalCommissions: number;
  paidCommissions: number;
  unpaidCommissions: number;
  expensesByCategory: Record<string, number>;
  monthlyTrend: Array<{ month: string; revenue: number; expenses: number; profit: number }>;
  topCustomers: Array<{ name: string; totalSpent: number; outstanding: number }>;
  recentTransactions: Array<{ date: string; type: string; amount: number; description: string }>;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-analyst`;

const FinancialAnalyst = () => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [financialData, setFinancialData] = useState<FinancialData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchFinancialData = async () => {
    setLoadingData(true);
    try {
      // Fetch all data in parallel
      const [
        invoicesResult,
        expensesResult,
        balancesResult,
        commissionsResult,
        paymentsResult,
        customersResult
      ] = await Promise.all([
        supabase.from('invoices').select('*, invoice_items(*)'),
        supabase.from('expenses').select('*').eq('approval_status', 'approved'),
        supabase.from('beginning_balances').select('*'),
        supabase.from('commissions').select('*'),
        supabase.from('payments').select('*, order:orders(job_title, customer:customers(name))'),
        supabase.from('customers').select('id, name')
      ]);

      const invoices = invoicesResult.data || [];
      const expenses = expensesResult.data || [];
      const balances = balancesResult.data || [];
      const commissions = commissionsResult.data || [];
      const payments = paymentsResult.data || [];
      const customers = customersResult.data || [];

      // Calculate beginning balance
      const beginningBalance = balances.reduce((sum, b) => sum + Number(b.amount || 0), 0);

      // Calculate revenue metrics (excluding drafts)
      const confirmedInvoices = invoices.filter(inv => !inv.is_draft);
      const totalRevenue = confirmedInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
      const collectedAmount = confirmedInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0);
      const outstandingAmount = totalRevenue - collectedAmount;

      // Calculate expenses
      const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

      // Net profit calculation
      const netProfit = beginningBalance + collectedAmount - totalExpenses;

      // Calculate profit recognition
      let recognizedProfit = 0;
      let pendingProfit = 0;
      confirmedInvoices.forEach((inv: any) => {
        const invoiceProfit = (inv.invoice_items || []).reduce((sum: number, item: any) => 
          sum + Number(item.line_profit || 0), 0);
        const invoiceTotal = Number(inv.total_amount) || 0;
        const amountPaid = Number(inv.amount_paid) || 0;
        if (invoiceTotal > 0) {
          const paymentRatio = Math.min(amountPaid / invoiceTotal, 1);
          recognizedProfit += invoiceProfit * paymentRatio;
          pendingProfit += invoiceProfit * (1 - paymentRatio);
        }
      });

      // Commission calculations
      const totalCommissions = commissions.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
      const paidCommissions = commissions.filter(c => c.paid_status === 'paid').reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
      const unpaidCommissions = totalCommissions - paidCommissions;

      // Expenses by category
      const expensesByCategory: Record<string, number> = {};
      expenses.forEach(exp => {
        const cat = exp.category || 'Uncategorized';
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(exp.amount || 0);
      });

      // Monthly trend (last 6 months)
      const monthlyTrend: Array<{ month: string; revenue: number; expenses: number; profit: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(new Date(), i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const monthName = format(monthDate, 'MMM yyyy');

        const monthRevenue = confirmedInvoices
          .filter(inv => {
            const invDate = new Date(inv.invoice_date);
            return invDate >= monthStart && invDate <= monthEnd;
          })
          .reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0);

        const monthExpenses = expenses
          .filter(exp => {
            const expDate = new Date(exp.expense_date);
            return expDate >= monthStart && expDate <= monthEnd;
          })
          .reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

        monthlyTrend.push({
          month: monthName,
          revenue: monthRevenue,
          expenses: monthExpenses,
          profit: monthRevenue - monthExpenses
        });
      }

      // Top customers by spending
      const customerSpending: Record<string, { name: string; totalSpent: number; outstanding: number }> = {};
      confirmedInvoices.forEach(inv => {
        const customerId = inv.customer_id;
        const customer = customers.find(c => c.id === customerId);
        if (customer) {
          if (!customerSpending[customerId]) {
            customerSpending[customerId] = { name: customer.name, totalSpent: 0, outstanding: 0 };
          }
          customerSpending[customerId].totalSpent += Number(inv.amount_paid || 0);
          customerSpending[customerId].outstanding += Number(inv.total_amount || 0) - Number(inv.amount_paid || 0);
        }
      });
      const topCustomers = Object.values(customerSpending)
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);

      // Recent transactions (payments and expenses)
      const recentTransactions: Array<{ date: string; type: string; amount: number; description: string }> = [];
      
      payments.slice(0, 10).forEach(p => {
        recentTransactions.push({
          date: p.payment_date,
          type: 'income',
          amount: Number(p.amount),
          description: `Payment from ${p.order?.customer?.name || 'Unknown'} for ${p.order?.job_title || 'Order'}`
        });
      });

      expenses.slice(0, 10).forEach(e => {
        recentTransactions.push({
          date: e.expense_date,
          type: 'expense',
          amount: Number(e.amount),
          description: `${e.category}: ${e.description}`
        });
      });

      recentTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setFinancialData({
        period: format(new Date(), 'MMMM yyyy'),
        beginningBalance,
        totalRevenue,
        collectedAmount,
        outstandingAmount,
        totalExpenses,
        netProfit,
        recognizedProfit,
        pendingProfit,
        totalCommissions,
        paidCommissions,
        unpaidCommissions,
        expensesByCategory,
        monthlyTrend,
        topCustomers,
        recentTransactions: recentTransactions.slice(0, 15)
      });
    } catch (error) {
      console.error('Error fetching financial data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch financial data",
        variant: "destructive"
      });
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchFinancialData();
  }, []);

  const streamChat = useCallback(async ({
    messages,
    onDelta,
    onDone,
  }: {
    messages: Message[];
    onDelta: (deltaText: string) => void;
    onDone: () => void;
  }) => {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, financialData }),
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to start stream");
    }

    if (!resp.body) throw new Error("No response body");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch { /* ignore */ }
      }
    }

    onDone();
  }, [financialData]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const upsertAssistant = (nextChunk: string) => {
      assistantSoFar += nextChunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: [...messages, userMsg],
        onDelta: (chunk) => upsertAssistant(chunk),
        onDone: () => setIsLoading(false),
      });
    } catch (error) {
      console.error("Chat error:", error);
      setIsLoading(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive"
      });
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const clearChat = () => {
    setMessages([]);
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const quickPrompts = [
    { icon: BarChart3, label: "Full Financial Report", prompt: "Generate a comprehensive financial report including P&L analysis, cash flow summary, and key insights for the current period." },
    { icon: TrendingUp, label: "Trend Analysis", prompt: "Analyze the monthly revenue and expense trends. Identify patterns, growth rates, and any concerning changes." },
    { icon: AlertTriangle, label: "Risk Assessment", prompt: "Identify any financial risks or red flags in the current data. Highlight areas that need immediate attention." },
    { icon: Lightbulb, label: "Recommendations", prompt: "Based on the financial data, provide actionable recommendations to improve profitability and cash flow." },
    { icon: LineChart, label: "Forecast", prompt: "Based on historical trends, forecast the next 3 months of revenue, expenses, and net profit. Include confidence levels and assumptions." },
    { icon: DollarSign, label: "Cash Position", prompt: "Analyze the current cash position, outstanding receivables, and liquidity. How healthy is the cash flow?" },
  ];

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Financial Analyst</h1>
              <p className="text-muted-foreground text-sm">Get intelligent insights and analysis of your financial data</p>
            </div>
          </div>
          <Button variant="outline" onClick={fetchFinancialData} disabled={loadingData}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingData ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>

        {/* Summary Cards */}
        {financialData && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(financialData.totalRevenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Collected</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(financialData.collectedAmount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-lg font-bold text-orange-600">{formatCurrency(financialData.outstandingAmount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Expenses</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(financialData.totalExpenses)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Net Profit</p>
                <p className={`text-lg font-bold ${financialData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(financialData.netProfit)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Opening Balance</p>
                <p className="text-lg font-bold">{formatCurrency(financialData.beginningBalance)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Chat Section */}
          <div className="lg:col-span-2">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="border-b pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Chat with AI Analyst</CardTitle>
                  <Button variant="ghost" size="sm" onClick={clearChat}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Ask me anything about your finances</p>
                    <p className="text-sm mt-2">I can analyze trends, identify risks, provide forecasts, and give recommendations</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-lg p-3 ${
                        msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}>
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg p-3">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </CardContent>
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Ask about revenue trends, expense analysis, forecasts, recommendations..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    className="resize-none"
                    rows={2}
                  />
                  <Button onClick={sendMessage} disabled={isLoading || !input.trim()}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Quick Prompts & Data Overview */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {quickPrompts.map((item, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className="w-full justify-start text-left h-auto py-3"
                    onClick={() => handleQuickPrompt(item.prompt)}
                  >
                    <item.icon className="h-4 w-4 mr-3 shrink-0" />
                    <span className="text-sm">{item.label}</span>
                  </Button>
                ))}
              </CardContent>
            </Card>

            {financialData && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Data Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="expenses">
                    <TabsList className="w-full">
                      <TabsTrigger value="expenses" className="flex-1">Expenses</TabsTrigger>
                      <TabsTrigger value="customers" className="flex-1">Customers</TabsTrigger>
                    </TabsList>
                    <TabsContent value="expenses" className="mt-4 space-y-2">
                      {Object.entries(financialData.expensesByCategory)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 5)
                        .map(([cat, amount]) => (
                          <div key={cat} className="flex justify-between items-center text-sm">
                            <span className="truncate">{cat}</span>
                            <Badge variant="secondary">{formatCurrency(amount)}</Badge>
                          </div>
                        ))}
                    </TabsContent>
                    <TabsContent value="customers" className="mt-4 space-y-2">
                      {financialData.topCustomers.slice(0, 5).map((cust, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                          <span className="truncate">{cust.name}</span>
                          <Badge variant="secondary">{formatCurrency(cust.totalSpent)}</Badge>
                        </div>
                      ))}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default FinancialAnalyst;
