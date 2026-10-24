import { Stars } from '@/components/site';
const samples = [
  ['English', 5, 'Quality is really good and the reel feels smooth. Would pick this again!'],
  ['Roman Hindi', 4, 'Manjha ki quality achhi hai, packing bhi mast thi. Thoda late aaya par overall satisfied hu.'],
  ['Roman Gujarati', 5, 'Manjha ni quality ekdam sari che, finishing pan mast che. Paisa vasool!'],
  ['English', 4, 'Good finish overall. Packaging could be a little better, but the reel feels worth it.'],
  ['Roman Hindi', 5, 'Bhai finishing ek number hai. Agli baar bhi yahi manjha lunga.'],
  ['Roman Gujarati', 4, 'Product saras che ane packing pan sari hati. Overall experience saro hato.'],
] as const;
export function SampleReviews() {
  return <details className="card mt-5 p-5"><summary className="cursor-pointer font-bold">Sample reviews: English, Roman Hindi & Roman Gujarati</summary>
    <p className="mt-2 text-sm text-stone-500">Illustrative examples, not customer testimonials. No purchases, identities or dates are claimed. These never affect product ratings.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{samples.map(([language, rating, review], i) => <figure key={i} className="rounded-xl border border-[#ecdcb9] p-4"><figcaption className="mb-2 text-xs font-bold">Sample / {language}</figcaption><Stars v={rating} /><blockquote className="mt-2 text-sm text-stone-600">{review}</blockquote></figure>)}</div>
  </details>;
}
