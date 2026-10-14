import { Suspense } from 'react';
import { SearchExperience } from './search-experience';
// Search results are personal and endless; keep them out of search engines.
export const metadata = { title: 'Search', robots: { index: false, follow: true } };
export default function SearchPage() {
  return <Suspense fallback={<div className="page pt-8"><div className="skeleton h-12 rounded-full" /></div>}><SearchExperience /></Suspense>;
}
