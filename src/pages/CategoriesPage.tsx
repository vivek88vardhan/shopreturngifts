import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useCategories } from '@/hooks/useApi';

import categoryReadyToEat from '@/assets/category-ready-to-eat.jpg';
import categorySnacks from '@/assets/category-snacks.jpg';
import categoryMillets from '@/assets/category-millets.jpg';
import categoryInstantMix from '@/assets/category-instant-mix.jpg';
import categoryDefault from '@/assets/category-default.jpg';

const CATEGORY_IMAGES: Record<string, string> = {
  'ready to eat': categoryReadyToEat,
  'snacks': categorySnacks,
  'millets': categoryMillets,
  'millet': categoryMillets,
  'instant mix': categoryInstantMix,
  'instant mixes': categoryInstantMix,
};

function getCategoryImage(name: string, imageUrl?: string): string {
  if (imageUrl) return imageUrl;
  const key = name.toLowerCase().trim();
  for (const [keyword, img] of Object.entries(CATEGORY_IMAGES)) {
    if (key.includes(keyword)) return img;
  }
  return categoryDefault;
}

export default function CategoriesPage() {
  const { data: categories, isLoading } = useCategories();
  const active = (categories || []).filter(c => c.isActive);

  return (
    <div className="sf-container py-8">
      <h1 className="text-2xl font-bold text-foreground">Categories</h1>
      <p className="mt-1 text-sm text-muted-foreground">Browse our product categories</p>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {active.map(cat => (
            <Link
              key={cat.categoryId}
              to={`/products?category=${encodeURIComponent(cat.name)}`}
              className="group overflow-hidden rounded-lg border transition-all hover:border-accent/30 hover:shadow-md"
            >
              <div className="aspect-[16/9] overflow-hidden">
                <img
                  src={getCategoryImage(cat.name, cat.imageUrl)}
                  alt={cat.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                  width={512}
                  height={288}
                />
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-foreground">{cat.name}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{cat.description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
