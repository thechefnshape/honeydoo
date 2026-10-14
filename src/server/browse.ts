import { listMerchants, listProducts } from './catalog';

// "More" groups the long-tail categories on the home row.
const MORE = ['plants', 'books'];

export async function merchantsFor(category?: string) {
  if (category === 'more') return (await Promise.all(MORE.map((c) => listMerchants({ category: c })))).flat().filter((m, i, a) => a.findIndex((x) => x.id === m.id) === i);
  return listMerchants({ category });
}
export async function productsFor(category?: string, opts: { featured?: boolean; limit?: number } = {}) {
  if (category === 'more') return (await Promise.all(MORE.map((c) => listProducts({ category: c, limit: opts.limit })))).flat();
  return listProducts({ category, featured: opts.featured, limit: opts.limit });
}
