import { BrandedLink as Link } from '@/components/loading';
import { WHATSAPP_URL } from '@/lib/data';
export default function Forgot() {
  return <div className="mx-auto max-w-md px-4 py-12"><div className="card p-7">
    <h1 className="font-serif text-2xl font-bold">Sign-in help</h1>
    <p className="mt-3 text-sm leading-relaxed text-stone-600">Customers can sign in with a mobile OTP. For staff password assistance, contact VPB support. Automated email password resets are currently unavailable.</p>
    <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5 w-full">Contact VPB support</a>
    <Link href="/login" className="btn-ghost mt-3 w-full">Sign in with OTP</Link>
  </div></div>;
}
