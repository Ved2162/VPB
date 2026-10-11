"use client";
import { LoadingError } from '@/components/loading';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="mx-auto max-w-xl px-4 py-16"><h1 className="font-serif text-2xl font-bold">Unable to load this page</h1><LoadingError error="Please check your connection and try again." retry={reset} /></div>;
}
