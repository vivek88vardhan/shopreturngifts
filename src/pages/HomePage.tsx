import { Link } from 'react-router-dom';
import { ArrowRight, Package, Zap, Loader2, Truck, Heart, ChevronRight, Gift, PartyPopper, Flower2, Sparkles, Cake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProductCard from '@/components/store/ProductCard';
import { useProducts, useCategories, useThemeConfig } from '@/hooks/useApi';
import { motion } from 'framer-motion';
import HomeHero from '@/components/home/HomeHero';
import SectionHeading from '@/components/home/SectionHeading';
import CartoonMomentSpotlight from '@/components/home/CartoonMomentSpotlight';
import InstagramReelsShowcase from '@/components/home/InstagramReelsShowcase';
import BrandVideoShowcase from '@/components/home/BrandVideoShowcase';
import { mascotImage, lifestyleImage, allMascotImages, occasionImage, fathersDayImages } from '@/data/shopreturnGiftsMedia';

const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: easeOut as unknown as [number, number, number, number] }
  })
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i: number) => ({
    opacity: 1, scale: 1,
    transition: { delay: i * 0.08, duration: 0.5, ease: easeOut as unknown as [number, number, number, number] }
  })
};

export default function HomePage() {
  const { data: productsData, isLoading: loadingProducts } = useProducts();
  const { data: categories, isLoading: loadingCategories } = useCategories();
  const { data: theme } = useThemeConfig();

  const featured = (productsData?.items || []).slice(0, 4);
  const activeCategories = (categories || []).filter(c => c.isActive);

  const storeName = theme?.storeName || 'ShopReturnGifts';
  const heroTagline = theme?.heroTagline || 'Return gifts that spark joy';
  const heroImageUrl = theme?.heroImageUrl;
  const promoLabel = theme?.promoLabel || 'Limited Time Offer';
  const promoHeadline = theme?.promoHeadline || 'Up to 10% Off New Arrivals';
  const promoSubtext = theme?.promoSubtext || "Don't miss out on this season's best deals";
  const promoBgImageUrl = theme?.promoBgImageUrl;
  const whatsappUrl = theme?.whatsappUrl?.trim() || '';
  const instagramUrl = theme?.instagramUrl?.trim() || '';
  const facebookUrl = theme?.facebookUrl?.trim() || '';

  const globalCelebrations = [
    { title: "Father's Day", desc: 'Thoughtful keepsakes and gift bundles for dads and grandpas.', icon: Gift, image: occasionImage('fathers-day-01') },
    { title: "Mother's Day", desc: 'Elegant keepsakes for moms and family gatherings.', icon: Flower2, image: mascotImage(13) },
    { title: "Valentine's Day", desc: 'Romantic and cute gifting bundles for couples.', icon: Heart, image: mascotImage(9) },
    { title: 'New Year', desc: 'Fresh-start gift boxes with premium festive picks.', icon: Sparkles, image: mascotImage(10) },
    { title: 'Easter', desc: 'Bright, kid-friendly egg-hunt favors and spring gift packs.', icon: PartyPopper, image: mascotImage(8) },
    { title: 'Independence Day', desc: 'Patriotic, red-white-and-blue themed party favors and gifts.', icon: Sparkles, image: occasionImage('independence-day') },
    { title: 'Halloween', desc: 'Playful themed gift packs for classrooms and parties.', icon: PartyPopper, image: occasionImage('halloween') },
    { title: 'Kids Party Favors', desc: 'Colorful, age-friendly return gifts that children love.', icon: Cake, image: mascotImage(4) },
  ];

  const promoBg =
    promoBgImageUrl ||
    lifestyleImage(6);

  return (
    <div className="overflow-x-clip">
      <HomeHero storeName={storeName} heroTagline={heroTagline} heroImageUrl={heroImageUrl} />

      {/* Upcoming Father's Day promo */}
      <section className="py-12 lg:py-16">
        <div className="sf-container">
          <motion.div
            className="overflow-hidden rounded-3xl border bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 shadow-xl"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-col gap-8 p-6 md:p-10 lg:flex-row lg:items-center">
              <div className="lg:w-1/3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-300">
                  <PartyPopper className="h-3.5 w-3.5" /> Coming soon
                </span>
                <h2 className="mt-4 text-3xl font-extrabold leading-tight text-white lg:text-4xl">
                  Upcoming Father&apos;s Day gifts are ready
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-white/75 lg:text-base">
                  Personalized hampers for dad — engraved mugs, leather keychains, gourmet treats, and beautifully wrapped baskets. Pre-book now and gift something he&apos;ll remember.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild size="lg" className="bg-amber-400 text-slate-900 hover:bg-amber-300">
                    <Link to="/products">
                      Shop Father&apos;s Day gifts <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-2/3 lg:grid-cols-2 xl:grid-cols-4">
                {fathersDayImages.map((src, i) => (
                  <motion.div
                    key={src}
                    custom={i}
                    variants={scaleIn}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-lg"
                  >
                    <img
                      src={src}
                      alt={`Father's Day gift basket ${i + 1}`}
                      className="aspect-square w-full object-cover transition-transform duration-500 hover:scale-105"
                      loading="lazy"
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-16 lg:py-20">
        <div className="sf-container">
          <SectionHeading
            eyebrow="Handpicked for you"
            title="Featured Products"
            description="Curated return gifts and party favor bundles from ShopReturnGifts"
            action={
              <Link to="/products" className="group flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
                View all
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            }
          />

          {loadingProducts ? (
            <div className="mt-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : featured.length > 0 ? (
            <motion.div
              className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
            >
              {featured.map((p, i) => (
                <motion.div key={p.productId} custom={i} variants={scaleIn}>
                  <ProductCard product={p} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <p className="mt-10 text-center text-muted-foreground">
              New return gift collections are on the way.{' '}
              <Link to="/products" className="font-semibold text-accent hover:underline">
                Browse the catalog
              </Link>{' '}
              to see what&apos;s available.
            </p>
          )}
        </div>
      </section>

      {/* Categories */}
      <section className="border-y bg-background-subtle py-16 lg:py-20">
        <div className="sf-container">
          <SectionHeading
            eyebrow="Explore"
            title="Shop by Category"
            description="Browse return gifts by occasion and collection"
            align="center"
          />

          {loadingCategories ? (
            <div className="mt-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : activeCategories.length > 0 ? (
            <motion.div
              className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
            >
              {activeCategories.map((cat, i) => (
                <motion.div key={cat.categoryId} custom={i} variants={scaleIn}>
                  <Link
                    to={`/products?category=${encodeURIComponent(cat.name)}`}
                    className="group flex flex-col items-center rounded-2xl border bg-card p-6 text-center transition-all hover:border-accent/30 hover:shadow-lg hover:-translate-y-1"
                  >
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-accent/5 transition-all group-hover:scale-110 group-hover:bg-accent/10">
                      {cat.imageUrl ? (
                        <img src={cat.imageUrl} alt={cat.name} className="h-full w-full rounded-2xl object-cover" />
                      ) : (
                        <Package className="h-7 w-7 text-muted-foreground group-hover:text-accent" />
                      )}
                    </div>
                    <p className="mt-4 text-sm font-bold text-foreground">{cat.name}</p>
                    <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{cat.description}</p>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <p className="mt-10 text-center text-muted-foreground">Categories will appear here once your catalog is live.</p>
          )}
        </div>
      </section>

      <CartoonMomentSpotlight />

      <InstagramReelsShowcase instagramUrl={instagramUrl} reelUrls={theme?.instagramReelUrls} />

      <BrandVideoShowcase />

      {/* Celebrations */}
      <section className="bg-background py-16 lg:py-20">
        <div className="sf-container">
          <SectionHeading
            eyebrow="Occasion-first shopping"
            title="Gifts for Celebrations Around the World"
            description="From classroom parties to cultural festivals — curated return gifts your guests will remember."
            align="center"
          />
          <motion.div
            className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
          >
            {globalCelebrations.map(({ title, desc, icon: Icon, image }, i) => (
              <motion.div
                key={title}
                custom={i}
                variants={scaleIn}
                className="overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-1 hover:border-accent/30 hover:shadow-lg"
              >
                <div className="relative h-36 overflow-hidden bg-muted">
                  <img src={image} alt="" className="h-full w-full object-cover object-top" />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                  <div className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-card/90 text-accent shadow-sm">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="text-base font-bold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
                  <Link to="/products" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                    Shop gifts <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Banner */}
      <section className="relative z-20">
        <div className="sf-container">
          <div className="overflow-hidden rounded-2xl border bg-card/95 shadow-xl shadow-black/5 backdrop-blur-sm">
            <motion.div
              className="grid grid-cols-1 gap-0 divide-y md:grid-cols-2 md:divide-x md:divide-y-0"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
            >
              {[
                { icon: Truck, title: 'Free Shipping', desc: 'On orders over $50', color: 'text-emerald-500' },
                { icon: Zap, title: 'Fast Delivery', desc: '2-5 business days', color: 'text-amber-500' },
              ].map(({ icon: Icon, title, desc, color }, i) => (
                <motion.div
                  key={title}
                  custom={i}
                  variants={fadeUp}
                  className="group flex items-center gap-4 px-8 py-6"
                >
                  <motion.div
                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accent/5 transition-colors group-hover:bg-accent/10"
                    whileHover={{ scale: 1.05, rotate: 5 }}
                  >
                    <Icon className={`h-5 w-5 ${color}`} />
                  </motion.div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Promotional Banner */}
      <section className="relative overflow-hidden">
        <div className="sf-container py-16 lg:py-20">
          <motion.div
            className="relative overflow-hidden rounded-3xl p-10 lg:p-16"
            style={{
              backgroundImage: `url(${promoBg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="absolute inset-0 bg-foreground/55" />
            <div className="pointer-events-none absolute bottom-4 right-4 hidden gap-2 lg:flex">
              {allMascotImages.slice(0, 5).map((src) => (
                <img key={src} src={src} alt="" className="h-16 w-16 rounded-xl border-2 border-white/30 object-cover object-top shadow-lg" />
              ))}
            </div>
            <div className="relative z-10 flex flex-col items-center justify-between gap-8 md:flex-row">
              <div className="text-center md:text-left">
                <motion.p
                  className="text-sm font-bold uppercase tracking-widest text-white/80"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                >
                  {promoLabel}
                </motion.p>
                <motion.h3
                  className="mt-3 text-3xl font-extrabold text-white lg:text-4xl"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 }}
                >
                  {promoHeadline}
                </motion.h3>
                <motion.p
                  className="mt-3 text-lg text-white/80"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 }}
                >
                  {promoSubtext}
                </motion.p>
              </div>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 }}
              >
                <Button asChild size="lg" className="h-12 bg-white px-8 text-base font-bold text-accent shadow-xl hover:bg-white/90">
                  <Link to="/products">
                    Shop return gifts <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16 lg:py-20">
        <div className="sf-container">
          <motion.div className="text-center" initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <motion.span custom={0} variants={fadeUp} className="text-xs font-bold uppercase tracking-widest text-accent">
              Why Us
            </motion.span>
            <motion.h2 custom={1} variants={fadeUp} className="mt-2 text-3xl font-extrabold text-foreground lg:text-4xl">
              Why Customers Love ShopReturnGifts
            </motion.h2>
          </motion.div>

          <motion.div
            className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {[
              {
                icon: Heart,
                title: 'Curated for celebrations',
                desc: 'Every bundle is chosen for parties, weddings, festivals, and classroom favors — not generic off-the-shelf filler.',
              },
              {
                icon: Truck,
                title: 'Fast, reliable delivery',
                desc: 'Same-day processing with express shipping so your return gifts arrive before the big day.',
              },
            ].map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                custom={i}
                variants={fadeUp}
                className="group relative rounded-2xl border bg-card p-8 transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="absolute left-8 top-0 h-1 w-12 rounded-b-full bg-accent/50 transition-all group-hover:w-20 group-hover:bg-accent" />
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/5 transition-colors group-hover:bg-accent/10">
                  <Icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="mt-5 text-lg font-bold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Social */}
      <section className="border-t bg-background-subtle py-16 lg:py-20">
        <div className="sf-container">
          <motion.div className="text-center" initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <motion.span custom={0} variants={fadeUp} className="text-xs font-bold uppercase tracking-widest text-accent">
              Community
            </motion.span>
            <motion.h2 custom={1} variants={fadeUp} className="mt-2 text-3xl font-extrabold text-foreground lg:text-4xl">
              Follow ShopReturnGifts
            </motion.h2>
            <motion.p custom={2} variants={fadeUp} className="mx-auto mt-3 max-w-md text-muted-foreground">
              New collections, launch updates, and party-gift inspiration on social.
            </motion.p>
          </motion.div>

          <motion.div
            className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {[
              {
                name: 'WhatsApp',
                desc: 'Launch alerts and exclusive drops',
                href: whatsappUrl,
                color: 'from-green-500 to-green-600',
                hoverBorder: 'hover:border-green-500/30',
                iconBg: 'bg-green-500/10',
                iconColor: 'text-green-600',
                svg: (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                ),
              },
              {
                name: 'Instagram',
                desc: 'Return gift ideas and reels',
                href: instagramUrl,
                color: 'from-pink-500 via-purple-500 to-orange-400',
                hoverBorder: 'hover:border-pink-500/30',
                iconBg: 'bg-pink-500/10',
                iconColor: 'text-pink-600',
                svg: (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                ),
              },
              {
                name: 'Facebook',
                desc: 'Community deals and events',
                href: facebookUrl,
                color: 'from-blue-600 to-blue-700',
                hoverBorder: 'hover:border-blue-500/30',
                iconBg: 'bg-blue-500/10',
                iconColor: 'text-blue-600',
                svg: (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                ),
              },
            ]
              .filter((social) => social.href)
              .map((social, i) => (
                <motion.a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  custom={i}
                  variants={scaleIn}
                  className={`group flex flex-col items-center rounded-2xl border bg-card p-8 text-center transition-all hover:-translate-y-1 hover:shadow-lg ${social.hoverBorder}`}
                  whileHover={{ scale: 1.02 }}
                >
                  <div
                    className={`flex h-16 w-16 items-center justify-center rounded-2xl ${social.iconBg} ${social.iconColor} transition-transform group-hover:scale-110`}
                  >
                    {social.svg}
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-foreground">{social.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{social.desc}</p>
                  <span
                    className={`mt-4 inline-flex items-center gap-1 rounded-full bg-gradient-to-r ${social.color} px-5 py-2 text-xs font-bold text-white shadow-md transition-shadow group-hover:shadow-lg`}
                  >
                    Join Now <ArrowRight className="h-3 w-3" />
                  </span>
                </motion.a>
              ))}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
