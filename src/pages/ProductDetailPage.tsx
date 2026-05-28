import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, Minus, Plus, ShoppingCart, Package, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProductPriceDisplay } from '@/components/store/ProductPriceDisplay';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { useProduct, useProducts, useProductFeedback, usePostProductRating, usePostProductComment } from '@/hooks/useApi';
import ProductCard from '@/components/store/ProductCard';
import { toast } from '@/lib/inboxToast';
import { clampCartQuantity, maxQtyForStock } from '@/lib/cartQuantity';

export default function ProductDetailPage() {
  const { productId: rawProductId } = useParams();
  const productId = rawProductId ? decodeURIComponent(rawProductId) : undefined;
  const { data: product, isLoading, isError } = useProduct(productId);
  const [qty, setQty] = useState(1);
  const addItem = useCartStore(s => s.addItem);

  const { data: relatedData } = useProducts(product ? { category: product.category } : undefined);
  const related = (relatedData?.items || []).filter(p => p.productId !== productId).slice(0, 4);
  const packageLookup = new Map((relatedData?.items || []).map((p) => [p.productId, p.name]));

  const feedback = useProductFeedback(productId);
  const postRating = usePostProductRating(productId);
  const postComment = usePostProductComment(productId);
  const [commentDraft, setCommentDraft] = useState('');
  const { isAuthenticated } = useAuthStore();

  const maxSelectable = product ? maxQtyForStock(product.stock) : 0;

  useEffect(() => {
    if (!product) return;
    setQty(q => clampCartQuantity(q, product.stock));
  }, [product?.productId, product?.stock]);

  const hasNutrition = product?.nutritionalFacts && product.nutritionalFacts.length > 0;
  const hasBenefits = !!product?.benefits;
  const hasUsage = !!product?.usage;
  const hasIngredients = !!product?.ingredients;
  const hasExtraInfo = hasNutrition || hasBenefits || hasUsage || hasIngredients;

  if (isLoading) {
    return <div className="sf-container flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (isError || !product) {
    return (
      <div className="sf-container flex flex-col items-center py-20">
        <p className="text-muted-foreground">Product not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/products">Back to Products</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="sf-container py-8">
      <Link to="/products" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Products
      </Link>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-lg border bg-secondary">
          {product.images?.[0] ? (
            <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Package className="h-20 w-20 text-muted-foreground/20" />
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-medium text-accent">{product.category}</span>
          <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">{product.name}</h1>
          <p className="mt-1 text-xs text-muted-foreground font-mono">{product.productId}</p>
          <div className="mt-2">
            <ProductPriceDisplay
              product={product}
              compareClassName="text-xl text-muted-foreground line-through decoration-muted-foreground sm:text-2xl"
              saleClassName="text-3xl font-bold text-foreground"
            />
          </div>

          <div className="mt-2">
            {product.stock > 0 ? (
              <span className="text-sm text-sf-success">In stock ({product.stock} available)</span>
            ) : (
              <span className="text-sm text-destructive">Out of stock</span>
            )}
          </div>

          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
          {(product.productType || 'product') === 'package' && (product.packageItems?.length || 0) > 0 && (
            <div className="mt-4 rounded-md border bg-background-subtle/40 p-3">
              <p className="text-sm font-medium text-foreground">Package includes</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {product.packageItems!.map((item) => (
                  <li key={item.productId}>
                    {item.qty} × {packageLookup.get(item.productId) || item.productId}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {product.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {product.tags.map(t => (
                <span key={t} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">{t}</span>
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <div className="flex items-center rounded-md border">
              <button
                type="button"
                onClick={() => setQty(q => clampCartQuantity(q - 1, product.stock))}
                disabled={product.stock === 0}
                className="flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>
              <Input
                type="number"
                min={1}
                max={maxSelectable}
                value={qty}
                onChange={e => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isNaN(n)) return;
                  setQty(clampCartQuantity(n, product.stock));
                }}
                className="h-10 w-14 border-0 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => setQty(q => clampCartQuantity(q + 1, product.stock))}
                disabled={product.stock === 0 || qty >= maxSelectable}
                className="flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Button
              className="min-w-[200px] flex-1 bg-accent text-accent-foreground hover:bg-accent-hover"
              disabled={product.stock === 0}
              onClick={() => {
                addItem(product, qty);
                toast.success(`${product.name} added to cart`);
              }}
            >
              <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
            </Button>
          </div>
          {maxSelectable > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Max {maxSelectable} of this item per order{product.stock < maxSelectable ? ` (${product.stock} in stock)` : ''}.
            </p>
          )}
        </div>
      </div>

      {/* Product Details Tabs */}
      {hasExtraInfo && (
        <section className="mt-12">
          <Tabs defaultValue={hasNutrition ? 'nutrition' : hasBenefits ? 'benefits' : hasUsage ? 'usage' : 'ingredients'}>
            <TabsList className="w-full justify-start">
              {hasNutrition && <TabsTrigger value="nutrition">Nutritional Facts</TabsTrigger>}
              {hasBenefits && <TabsTrigger value="benefits">Benefits</TabsTrigger>}
              {hasUsage && <TabsTrigger value="usage">Usage</TabsTrigger>}
              {hasIngredients && <TabsTrigger value="ingredients">Ingredients</TabsTrigger>}
            </TabsList>

            {hasNutrition && (
              <TabsContent value="nutrition" className="mt-4">
                <div className="rounded-lg border overflow-hidden max-w-md">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold text-foreground">Nutrient</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {product.nutritionalFacts!.map((fact, i) => (
                        <tr key={i} className="hover:bg-secondary/50">
                          <td className="px-4 py-2 text-foreground">{fact.label}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">
                            {fact.value}{fact.unit ? ` ${fact.unit}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            )}

            {hasBenefits && (
              <TabsContent value="benefits" className="mt-4">
                <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-line">
                  {product.benefits}
                </div>
              </TabsContent>
            )}

            {hasUsage && (
              <TabsContent value="usage" className="mt-4">
                <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-line">
                  {product.usage}
                </div>
              </TabsContent>
            )}

            {hasIngredients && (
              <TabsContent value="ingredients" className="mt-4">
                <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-line">
                  {product.ingredients}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </section>
      )}

      {productId && !feedback.isError && (feedback.isLoading || (feedback.data?.ratingsEnabled || feedback.data?.commentsEnabled)) && (
        <section className="mt-12 rounded-lg border p-6">
          <h2 className="text-lg font-semibold text-foreground">Ratings &amp; reviews</h2>
          {feedback.isLoading && (
            <div className="mt-6 flex justify-center py-6">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
            </div>
          )}
          {!feedback.isLoading && feedback.data && (feedback.data.ratingsEnabled || feedback.data.commentsEnabled) && (
            <div className="mt-4 space-y-8">
              {feedback.data.ratingsEnabled && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Average{' '}
                    <span className="font-semibold text-foreground">
                      {feedback.data.ratingCount > 0 ? feedback.data.averageRating.toFixed(1) : '—'}
                    </span>
                    {' '}of 5
                    {feedback.data.ratingCount > 0
                      ? ` · ${feedback.data.ratingCount} rating${feedback.data.ratingCount === 1 ? '' : 's'}`
                      : ' · No ratings yet'}
                  </p>
                  {isAuthenticated ? (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-2">Tap a star to rate (1–5)</p>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(s => (
                          <button
                            key={s}
                            type="button"
                            disabled={postRating.isPending}
                            onClick={async () => {
                              try {
                                await postRating.mutateAsync(s);
                                toast.success(`Saved your ${s}-star rating`);
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Could not save rating');
                              }
                            }}
                            className="rounded p-1 text-amber-400 transition-colors hover:bg-amber-500/15 disabled:opacity-50"
                            aria-label={`Rate ${s} out of 5 stars`}
                          >
                            <Star className="h-7 w-7" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      <Link to="/login" className="text-accent underline underline-offset-2">Sign in</Link> to rate this product.
                    </p>
                  )}
                </div>
              )}
              {feedback.data.commentsEnabled && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Comments</h3>
                  <ul className="mt-3 space-y-3">
                    {feedback.data.comments.length === 0 && (
                      <li className="text-sm text-muted-foreground">No comments yet.</li>
                    )}
                    {feedback.data.comments.map(c => (
                      <li key={c.commentId} className="rounded-md border bg-card p-3 text-sm">
                        <p className="font-medium text-foreground">{c.userName || 'Customer'}</p>
                        <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{c.body}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</p>
                      </li>
                    ))}
                  </ul>
                  {isAuthenticated ? (
                    <div className="mt-4 space-y-2 max-w-xl">
                      <Label htmlFor="product-comment">Add a comment</Label>
                      <Textarea
                        id="product-comment"
                        rows={3}
                        maxLength={500}
                        value={commentDraft}
                        onChange={e => setCommentDraft(e.target.value)}
                        placeholder="Share your experience (max 500 characters)"
                        className="resize-none"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={postComment.isPending || !commentDraft.trim()}
                        className="bg-accent text-accent-foreground hover:bg-accent-hover"
                        onClick={async () => {
                          try {
                            await postComment.mutateAsync(commentDraft.trim());
                            setCommentDraft('');
                            toast.success('Comment posted');
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Could not post comment');
                          }
                        }}
                      >
                        {postComment.isPending ? 'Posting…' : 'Post comment'}
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      <Link to="/login" className="text-accent underline underline-offset-2">Sign in</Link> to leave a comment.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold text-foreground">Related Products</h2>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map(p => <ProductCard key={p.productId} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
