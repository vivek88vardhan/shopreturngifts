import { useParams, Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Minus, Plus, ShoppingCart, Package, Loader2, Star, Upload, X, Sparkles } from 'lucide-react';
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
import { isCustomProduct } from '@/lib/customProduct';
import { uploadsApi } from '@/lib/api';

export default function ProductDetailPage() {
  const { productId: rawProductId } = useParams();
  const location = useLocation();
  const productId = rawProductId ? decodeURIComponent(rawProductId) : undefined;
  const { data: product, isLoading, isError } = useProduct(productId);
  const [qty, setQty] = useState(1);
  const addItem = useCartStore(s => s.addItem);

  // ─── Engraving (Custom-category personalization) ───
  const [engraveName, setEngraveName] = useState('');
  const [engraveMessage, setEngraveMessage] = useState('');
  const [engraveImageUrl, setEngraveImageUrl] = useState('');
  const [engraveImagePreview, setEngraveImagePreview] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const engraveFileRef = useRef<HTMLInputElement>(null);
  const isCustom = isCustomProduct(product);

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

  const MAX_ENGRAVE_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB — supports high-resolution images

  const handleEngraveImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > MAX_ENGRAVE_IMAGE_BYTES) {
      toast.error('Image is too large (max 15MB)');
      return;
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    setUploadingImage(true);
    const localPreview = URL.createObjectURL(file);
    setEngraveImagePreview(localPreview);
    try {
      const { uploadUrl, imageUrl } = await uploadsApi.getEngravingImageUploadUrl(ext);
      const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!res.ok) throw new Error('Upload failed');
      setEngraveImageUrl(imageUrl);
      toast.success('Image uploaded');
    } catch (err) {
      setEngraveImagePreview('');
      toast.error(err instanceof Error && err.message ? err.message : 'Could not upload image. Please sign in and try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const resetEngraving = () => {
    setEngraveName('');
    setEngraveMessage('');
    setEngraveImageUrl('');
    setEngraveImagePreview('');
    if (engraveFileRef.current) engraveFileRef.current.value = '';
  };

  const engravingComplete = !!engraveName.trim() && !!engraveMessage.trim() && !!engraveImageUrl && !uploadingImage;

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

          {isCustom ? (
            <div className="mt-8">
              <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Sparkles className="h-4 w-4 text-accent" /> Personalize your engraving
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  All fields are required for custom engraved items.
                </p>

                {!isAuthenticated ? (
                  <div className="mt-4 rounded-lg border bg-card p-4 text-sm">
                    <p className="text-muted-foreground">
                      Please{' '}
                      <Link
                        to="/login"
                        state={{ from: location.pathname }}
                        className="font-semibold text-accent underline underline-offset-2"
                      >
                        sign in
                      </Link>{' '}
                      to personalize and add this item to your cart.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div>
                      <Label htmlFor="engrave-name">Name to be engraved <span className="text-destructive">*</span></Label>
                      <Input
                        id="engrave-name"
                        value={engraveName}
                        maxLength={120}
                        onChange={e => setEngraveName(e.target.value)}
                        placeholder="e.g. James"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="engrave-message">Custom message <span className="text-destructive">*</span></Label>
                      <Textarea
                        id="engrave-message"
                        value={engraveMessage}
                        maxLength={1000}
                        rows={3}
                        onChange={e => setEngraveMessage(e.target.value)}
                        placeholder="e.g. Happy Father's Day — love always"
                        className="mt-1 resize-none"
                      />
                    </div>
                    <div>
                      <Label>Upload 1 high-resolution image <span className="text-destructive">*</span></Label>
                      <input
                        ref={engraveFileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) void handleEngraveImage(file);
                        }}
                      />
                      {engraveImagePreview ? (
                        <div className="mt-2 flex items-center gap-3 rounded-lg border bg-card p-3">
                          <img src={engraveImagePreview} alt="Engraving preview" className="h-16 w-16 rounded-md object-cover" />
                          <div className="flex flex-1 flex-col">
                            <span className="text-xs font-medium text-foreground">
                              {uploadingImage ? 'Uploading…' : 'Image ready'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {uploadingImage ? 'Please wait' : 'High-resolution image attached'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={resetEngraving}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove uploaded image"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => engraveFileRef.current?.click()}
                          disabled={uploadingImage}
                          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed bg-card py-6 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-50"
                        >
                          {uploadingImage ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                          ) : (
                            <><Upload className="h-4 w-4" /> Choose image (max 15MB)</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Button
                className="mt-4 w-full bg-accent text-accent-foreground hover:bg-accent-hover sm:w-auto sm:min-w-[260px]"
                disabled={product.stock === 0 || !isAuthenticated || !engravingComplete}
                onClick={() => {
                  addItem(product, 1, {
                    name: engraveName.trim(),
                    message: engraveMessage.trim(),
                    imageUrl: engraveImageUrl,
                  });
                  resetEngraving();
                  toast.success(`${product.name} added to cart`);
                }}
              >
                <ShoppingCart className="mr-2 h-4 w-4" /> Add personalized item to cart
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Each personalized item is added individually. Add again to order multiple engravings.
              </p>
            </div>
          ) : (
            <>
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
            </>
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
