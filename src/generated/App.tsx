import { useState, useEffect, useRef } from 'react';
import { Send, TrendingUp, DollarSign, AlertCircle, BarChart3, ArrowLeft } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Textarea } from '@components/ui/textarea';
import { cn } from '@lib/utils';
import { processQuery, getQuickStats } from '@generated/server/analytics';
import { FormattedResponse } from '@generated/components/FormattedResponse';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  context?: {
    workOrdersCount: number;
    dealsCount: number;
    source: string;
  };
  timestamp: Date;
}

const STARTER_QUESTIONS = [
  'How is the pipeline looking by sector?',
  'What is our exposure in open deals?',
  'Which work orders have billing or collection risk?',
  'Prepare a leadership update'
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getQuickStats()
      .then(res => setStats(res))
      .catch(err => console.error('Failed to load stats:', err));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (query: string) => {
    if (!query.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const result = await processQuery({ data: { query } }) as {
        answer: string;
        context: {
          workOrdersCount: number;
          dealsCount: number;
          source: string;
        };
      };
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.answer,
        context: result.context,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I encountered an issue processing your request. Please try rephrasing your question or check your data connections.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(input);
    }
  };

  return (
    <div className="relative flex h-screen flex-col bg-[hsl(var(--color-slate-canvas))] overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/4 right-1/4 h-[350px] bg-gradient-to-b from-[hsl(var(--color-cobalt))]/10 to-transparent pointer-events-none blur-3xl rounded-full" />
      <div className="absolute bottom-10 left-10 h-[200px] w-[200px] bg-[hsl(var(--color-sky))]/5 pointer-events-none blur-3xl rounded-full" />

      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--sidebar))] px-6 py-4 z-10">
        <div className="flex items-center gap-4">
          {messages.length > 0 && (
            <Button
              onClick={() => setMessages([])}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--color-text-slate))] transition-all hover:border-[hsl(var(--color-cobalt))] hover:text-[hsl(var(--color-frost))] hover:scale-105 active:scale-95 cursor-pointer shadow-[0_2px_8px_rgba(59,130,246,0.05)]"
              title="Back to Home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-xl font-medium tracking-tight text-[hsl(var(--color-frost))]">
              Business Intelligence
            </h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-wider text-[hsl(var(--color-text-slate-muted))]">
              Skylark Drones Technical Assignment
            </p>
          </div>
        </div>
        
        {stats && (
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[hsl(var(--color-sky))]" />
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-[hsl(var(--color-text-slate-muted))]">
                  Work Orders
                </div>
                <div className="text-lg font-medium text-[hsl(var(--color-frost))]">
                  {stats.workOrders.totalWorkOrders}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[hsl(var(--color-sky))]" />
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-[hsl(var(--color-text-slate-muted))]">
                  Pipeline Deals
                </div>
                <div className="text-lg font-medium text-[hsl(var(--color-frost))]">
                  {stats.deals.totalDeals}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Chat Area */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-4xl">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--card))]" 
                     style={{ boxShadow: 'var(--glow-cobalt)' }}>
                  <DollarSign className="h-10 w-10 text-[hsl(var(--color-sky))]" />
                </div>
                
                <h2 className="mb-2 text-2xl font-medium tracking-tight text-[hsl(var(--color-frost))]">
                  Ask me about your business
                </h2>
                <p className="mb-8 text-center text-sm text-[hsl(var(--color-text-slate))]">
                  I can help you understand revenue, pipeline health, sectoral performance,<br />
                  operational metrics, and more from your live monday.com boards.
                </p>

                <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
                  {STARTER_QUESTIONS.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => handleSubmit(question)}
                      className="group rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-left text-sm text-[hsl(var(--color-text-slate))] transition-all duration-200 hover:border-[hsl(var(--color-cobalt))] hover:text-[hsl(var(--color-frost))] hover:translate-y-[-2px] hover:shadow-[0_4px_12px_rgba(59,130,246,0.1)] cursor-pointer"
                      style={{ backdropFilter: 'blur(12px)' }}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'mb-6 flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-xl px-5 py-4 transition-all duration-200',
                    message.role === 'user'
                      ? 'bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary))]/90 text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/10'
                      : 'border border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 text-[hsl(var(--color-text-slate))] hover:border-[hsl(var(--color-cobalt))]/30'
                  )}
                  style={
                    message.role === 'assistant'
                      ? { backdropFilter: 'blur(16px)', boxShadow: 'var(--glow-cobalt)' }
                      : undefined
                  }
                >
                  <div className="leading-relaxed">
                    {message.role === 'assistant' ? (
                      <FormattedResponse content={message.content} />
                    ) : (
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    )}
                  </div>
                  
                  {message.context && (
                    <div className="mt-3 border-t border-[hsl(var(--border))] pt-3">
                      <div className="flex items-start gap-2 font-mono text-xs text-[hsl(var(--color-text-slate-muted))]">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        <div>
                          <div className="uppercase tracking-wider">Data Source</div>
                          <div className="mt-1">{message.context.source}</div>
                          <div className="mt-1">
                            Analyzed {message.context.workOrdersCount} work order{message.context.workOrdersCount !== 1 ? 's' : ''}, {message.context.dealsCount} deal{message.context.dealsCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="mb-6 flex justify-start">
                <div
                  className="max-w-[85%] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4"
                  style={{ backdropFilter: 'blur(12px)', boxShadow: 'var(--glow-cobalt)' }}
                >
                  <div className="flex items-center gap-2 text-[hsl(var(--color-text-slate))]">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--color-sky))]" />
                    <div className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--color-sky))]" style={{ animationDelay: '0.2s' }} />
                    <div className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--color-sky))]" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="shrink-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--sidebar))] px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <div className="flex gap-3">
              <Textarea
                value={input}
                onChange={(e: any) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about revenue, pipeline, sectors, or type 'prepare a leadership update'..."
                className="min-h-[60px] flex-1 resize-none border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--color-frost))] placeholder:text-[hsl(var(--color-text-slate-muted))] focus-visible:ring-[hsl(var(--ring))]"
                disabled={loading}
                style={{ backdropFilter: 'blur(12px)' }}
              />
              <Button
                onClick={() => handleSubmit(input)}
                disabled={!input.trim() || loading}
                className="h-[60px] w-[60px] shrink-0 rounded-xl bg-[hsl(var(--primary))] p-0 text-[hsl(var(--primary-foreground))] transition-all hover:scale-105 active:scale-95 hover:bg-[hsl(var(--primary))]/90 cursor-pointer disabled:pointer-events-none"
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
            <p className="mt-2 text-center font-mono text-xs text-[hsl(var(--color-text-slate-muted))]">
              Press Enter to send • Shift + Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
