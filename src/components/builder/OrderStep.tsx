'use client';

import { useState } from 'react';
import { useBuilder } from '@/context/BuilderContext';
import { getPricePerCard, getPackType } from '@/lib/pricing';
import CardCanvas from './CardCanvas';

const QUANTITIES = [1, 2, 5, 10, 15, 20, 25, 50, 75, 100];

export default function OrderStep() {
  const { card, order, updateOrder, prevStep } = useBuilder();
  const [processing, setProcessing] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);

  const pricePerCard = getPricePerCard(order.quantity);
  const subtotal = pricePerCard * order.quantity;
  const shipping = order.quantity >= 5 ? 0 : 4.99;
  const total = subtotal + shipping;
  const packType = getPackType(order.quantity);

  const handleCheckout = () => {
    setProcessing(true);
    // Simulate Stripe checkout
    setTimeout(() => {
      setProcessing(false);
      setOrderComplete(true);
    }, 2000);
  };

  if (orderComplete) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-3xl font-bold text-white mb-3">Order Confirmed!</h2>
        <p className="text-gray-400 mb-6 max-w-md mx-auto">
          Your custom cards are being printed and will ship within 5-7 business days.
          A confirmation email will be sent to {order.email || 'your email'}.
        </p>
        <div className="flex justify-center mb-8">
          <CardCanvas card={card} side="front" width={200} />
        </div>
        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 max-w-sm mx-auto mb-6">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-gray-400">Quantity:</span>
            <span className="text-white">{order.quantity} cards</span>
            <span className="text-gray-400">Total:</span>
            <span className="text-white font-bold">${total.toFixed(2)}</span>
          </div>
        </div>
        <a href="/" className="text-red-500 hover:text-red-400 font-semibold text-sm">
          &larr; Back to Home
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 max-w-5xl mx-auto">
      {/* Order Form */}
      <div className="flex-1 space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Place Your Order</h2>
          <p className="text-gray-400">Choose quantity and complete checkout</p>
        </div>

        {/* Quantity */}
        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
          <h3 className="text-sm font-semibold text-white mb-3">Quantity</h3>
          <div className="flex flex-wrap gap-2">
            {QUANTITIES.map((qty) => (
              <button
                key={qty}
                onClick={() => updateOrder({ quantity: qty, packType: getPackType(qty) })}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  order.quantity === qty
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {qty}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="text-xs text-gray-400">Custom:</label>
            <input
              type="number"
              min="1"
              max="500"
              value={order.quantity}
              onChange={(e) => {
                const qty = Math.max(1, Math.min(500, parseInt(e.target.value) || 1));
                updateOrder({ quantity: qty, packType: getPackType(qty) });
              }}
              className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Pricing breakdown */}
          <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">Pack type:</span>
              <span className="text-white capitalize font-medium">{packType}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">Price per card:</span>
              <span className="text-white">${pricePerCard.toFixed(2)}</span>
            </div>
            {packType !== 'single' && (
              <div className="text-xs text-green-400 mt-1">
                You save ${((getPricePerCard(1) - pricePerCard) * order.quantity).toFixed(2)} with {packType} pricing!
              </div>
            )}
          </div>
        </div>

        {/* Shipping Info */}
        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 space-y-3">
          <h3 className="text-sm font-semibold text-white">Shipping Information</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="First Name"
              value={order.firstName}
              onChange={(e) => updateOrder({ firstName: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
            <input
              type="text"
              placeholder="Last Name"
              value={order.lastName}
              onChange={(e) => updateOrder({ lastName: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
            <input
              type="email"
              placeholder="Email Address"
              value={order.email}
              onChange={(e) => updateOrder({ email: e.target.value })}
              className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
            <input
              type="text"
              placeholder="Street Address"
              value={order.address}
              onChange={(e) => updateOrder({ address: e.target.value })}
              className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
            <input
              type="text"
              placeholder="City"
              value={order.city}
              onChange={(e) => updateOrder({ city: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="State"
                value={order.state}
                onChange={(e) => updateOrder({ state: e.target.value })}
                className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
              <input
                type="text"
                placeholder="ZIP"
                value={order.zip}
                onChange={(e) => updateOrder({ zip: e.target.value })}
                className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <button onClick={prevStep} className="text-gray-400 hover:text-white transition-colors text-sm">
            &larr; Back
          </button>
        </div>
      </div>

      {/* Order Summary Sidebar */}
      <div className="lg:w-80 lg:sticky lg:top-24 lg:self-start space-y-4">
        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
          <h3 className="text-sm font-semibold text-white mb-4">Order Summary</h3>

          <div className="flex justify-center mb-4">
            <CardCanvas card={card} side="front" width={200} />
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">{order.quantity}x Custom Card</span>
              <span className="text-white">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Shipping</span>
              <span className="text-white">{shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}</span>
            </div>
            <div className="border-t border-gray-700 pt-2 flex justify-between font-bold">
              <span className="text-white">Total</span>
              <span className="text-white">${total.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            disabled={processing || !order.firstName || !order.lastName || !order.email || !order.address || !order.city || !order.state || !order.zip}
            className="w-full mt-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </>
            ) : (
              <>Pay ${total.toFixed(2)}</>
            )}
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            Powered by Stripe (Test Mode)
          </p>
        </div>
      </div>
    </div>
  );
}
