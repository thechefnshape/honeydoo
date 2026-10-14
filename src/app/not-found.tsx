import Link from 'next/link';
import { BeeMark } from '@/components/brand';
export default function NotFound() {
  return (
    <div className="page flex flex-col items-center pt-24 text-center">
      <BeeMark className="h-14 w-auto" />
      <h1 className="mt-6 text-2xl font-semibold">We could not find that</h1>
      <p className="mt-2 text-charcoal">The page may have moved, or the item is no longer listed.</p>
      <Link href="/" className="btn-dark mt-6">Back to honeydoo</Link>
    </div>
  );
}
