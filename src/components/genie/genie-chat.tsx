"use client";

import { ArrowUp, ShoppingBag, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  CommerceCart,
  CommerceCheckout,
  CommerceProduct,
  GenieResponse,
} from "@/lib/commerce/types";

type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  response?: GenieResponse;
};

type Action = {
  tool: string;
  input: Record<string, unknown>;
};

export function GenieChat({ store }: { store: string }) {
  const [conversationId, setConversationId] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi, I’m Genie. Ask me to find products, compare options, build your cart, or prepare secure Shopify checkout.",
    },
  ]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = "aladdyn-genie-conversation";
    const saved = window.localStorage.getItem(key);
    const id = saved || crypto.randomUUID();
    window.localStorage.setItem(key, id);
    setConversationId(id);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, loading]);

  async function send(text: string, action?: Action) {
    const trimmed = text.trim();
    if (!trimmed || !conversationId || loading) return;
    const messageId = crypto.randomUUID();
    setEntries((current) => [
      ...current,
      { id: messageId, role: "user", text: trimmed },
    ]);
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          messageId,
          message: trimmed,
          ...(action ? { action } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "Genie is unavailable");
      setEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: body.message,
          response: body,
        },
      ]);
    } catch (reason) {
      setEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            reason instanceof Error ? reason.message : "Genie is unavailable",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-73px)] bg-[#f4f7fb] p-4 sm:p-7">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl bg-[#0a1626] p-5 text-white shadow-xl shadow-slate-900/10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-300 text-slate-950">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="mt-5 text-xl font-semibold">Aladdyn Genie</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Shopper commerce for {store}. Shopify remains the merchant of
            record.
          </p>
          <div className="mt-6 space-y-2 text-sm text-slate-300">
            <button
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-left hover:bg-white/10"
              onClick={() => void send("Show me products under ₹2000")}
            >
              Find products
            </button>
            <button
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-left hover:bg-white/10"
              onClick={() => void send("Show my cart")}
            >
              View cart
            </button>
            <button
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-left hover:bg-white/10"
              onClick={() => void send("Checkout")}
            >
              Checkout
            </button>
          </div>
          <p className="mt-6 border-t border-white/10 pt-5 text-xs leading-5 text-slate-500">
            Genie never collects card details. Checkout opens on Shopify.
          </p>
        </aside>

        <section className="panel flex min-h-[72vh] flex-col overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="font-semibold text-slate-950">
              Shopping conversation
            </div>
            <div className="mt-1 text-xs text-emerald-700">
              Live store catalog · UCP 2026-04-08
            </div>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
            {entries.map((entry) => (
              <div
                className={
                  entry.role === "user"
                    ? "ml-auto max-w-[80%]"
                    : "mr-auto max-w-3xl"
                }
                key={entry.id}
              >
                <div
                  className={
                    entry.role === "user"
                      ? "rounded-2xl rounded-br-md bg-slate-950 px-4 py-3 text-sm text-white"
                      : "rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-800"
                  }
                >
                  {entry.text}
                </div>
                {entry.response?.products && (
                  <ProductCards
                    products={entry.response.products}
                    send={send}
                  />
                )}
                {entry.response?.cart && (
                  <CartCard cart={entry.response.cart} send={send} />
                )}
                {entry.response?.checkout && (
                  <CheckoutCard checkout={entry.response.checkout} />
                )}
              </div>
            ))}
            {loading && (
              <div className="mr-auto rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm text-slate-500">
                Genie is checking Shopify…
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="border-t border-slate-200 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send(message);
            }}
          >
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 focus-within:border-cyan-500">
              <input
                aria-label="Message Genie"
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none"
                disabled={loading}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Show me black shirts under ₹2000"
                value={message}
              />
              <button
                aria-label="Send"
                className="rounded-lg bg-cyan-300 p-2.5 text-slate-950 disabled:opacity-40"
                disabled={!message.trim() || loading || !conversationId}
                type="submit"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function ProductCards({
  products,
  send,
}: {
  products: CommerceProduct[];
  send: (text: string, action?: Action) => Promise<void>;
}) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {products.map((product) => (
        <article
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          key={product.productId}
        >
          {product.images[0] && (
            <div
              aria-label={product.images[0].altText ?? product.title}
              className="h-32 bg-slate-100 bg-cover bg-center"
              role="img"
              style={{
                backgroundImage: `url(${JSON.stringify(product.images[0].url)})`,
              }}
            />
          )}
          <div className="p-4">
            <h3 className="font-semibold text-slate-950">{product.title}</h3>
            <p className="mt-1 text-sm font-medium text-cyan-800">
              {formatMoney(product.price.amountMinor, product.price.currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {product.availability === "available"
                ? "Available"
                : "Availability varies"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                onClick={() =>
                  void send(`View ${product.title}`, {
                    tool: "get_product",
                    input: { productId: product.productId },
                  })
                }
              >
                View
              </button>
              {product.variants
                .filter((variant) => variant.available)
                .slice(0, 4)
                .map((variant) => (
                  <button
                    className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white"
                    key={variant.variantId}
                    onClick={() =>
                      void send(`Add ${variant.title}`, {
                        tool: "add_to_cart",
                        input: { variantId: variant.variantId, quantity: 1 },
                      })
                    }
                  >
                    Add{" "}
                    {variant.title === "Default Title"
                      ? "to cart"
                      : variant.title}
                  </button>
                ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function CartCard({
  cart,
  send,
}: {
  cart: CommerceCart;
  send: (text: string, action?: Action) => Promise<void>;
}) {
  const total = cart.totals.find((item) => item.type === "total")?.money;
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 font-semibold">
        <ShoppingBag className="h-4 w-4" /> Your cart
      </div>
      <div className="mt-3 space-y-3">
        {cart.lines.length === 0 ? (
          <p className="text-sm text-slate-500">Your cart is empty.</p>
        ) : (
          cart.lines.map((line) => (
            <div
              className="flex items-center justify-between gap-4 text-sm"
              key={line.variantId}
            >
              <div>
                <div className="font-medium text-slate-900">{line.title}</div>
                <div className="text-xs text-slate-500">
                  Qty: {line.quantity}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {line.price && (
                  <span>
                    {formatMoney(
                      line.price.amountMinor * line.quantity,
                      line.price.currency,
                    )}
                  </span>
                )}
                <button
                  className="text-xs text-rose-600"
                  onClick={() =>
                    void send(`Remove ${line.title}`, {
                      tool: "remove_from_cart",
                      input: { variantId: line.variantId },
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {total && (
        <div className="mt-4 border-t border-slate-200 pt-3 text-right font-semibold">
          Total: {formatMoney(total.amountMinor, total.currency)}
        </div>
      )}
      {cart.lines.length > 0 && (
        <button
          className="btn-primary mt-4 w-full"
          onClick={() => void send("Checkout", { tool: "checkout", input: {} })}
        >
          Checkout
        </button>
      )}
    </div>
  );
}

function CheckoutCard({ checkout }: { checkout: CommerceCheckout }) {
  const total = checkout.totals.find((item) => item.type === "total")?.money;
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="font-semibold text-emerald-950">
        Your cart is ready ✅
      </div>
      {total && (
        <p className="mt-2 text-sm text-emerald-900">
          Total: {formatMoney(total.amountMinor, total.currency)}
        </p>
      )}
      <a
        className="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
        href={checkout.continueUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        Continue Secure Checkout
      </a>
    </div>
  );
}

function formatMoney(amountMinor: number, currency: string) {
  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** digits);
}
