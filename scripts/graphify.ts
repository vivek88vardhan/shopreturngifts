#!/usr/bin/env bun
/**
 * graphify.ts — KiranaBandi codebase knowledge-graph generator for LLM context.
 *
 * Walks the entire repository and emits two artefacts:
 *   graphify-output/graph.json        — structured knowledge graph (nodes + edges)
 *   graphify-output/llm-context.md    — flat, LLM-friendly Markdown digest
 *
 * Run:  bun run graphify
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, relative, extname, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');
const OUT_DIR = join(ROOT, 'graphify-output');

// ─── Graph types ────────────────────────────────────────────────────────────

type NodeType =
  | 'page'
  | 'component'
  | 'store'
  | 'hook'
  | 'lib'
  | 'ts_type'
  | 'api_endpoint'
  | 'go_handler'
  | 'go_model'
  | 'dynamo_entity'
  | 'frontend_route';

type EdgeRelation =
  | 'imports'
  | 'maps_to_route'
  | 'handled_by'
  | 'uses_model'
  | 'stored_as'
  | 'uses_store'
  | 'uses_hook';

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  path?: string;
  meta?: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: EdgeRelation;
}

interface ApiEndpoint {
  method: string;
  path: string;
  handler: string;
  auth: 'public' | 'authenticated' | 'admin';
  rateLimit?: boolean;
}

interface TsTypeNode {
  name: string;
  kind: 'interface' | 'type_alias' | 'enum';
  fields: string[];
}

interface GoModel {
  name: string;
  fields: string[];
}

interface DynamoEntity {
  entity: string;
  pk: string;
  sk: string;
  gsi1pk?: string;
  gsi1sk?: string;
  keyFields: string[];
}

interface KnowledgeGraph {
  generated_at: string;
  project: string;
  repo_root: string;
  stack: Record<string, string>;
  nodes: GraphNode[];
  edges: GraphEdge[];
  api_endpoints: ApiEndpoint[];
  frontend_routes: { path: string; page: string; layout: string; auth: boolean }[];
  ts_types: TsTypeNode[];
  go_models: GoModel[];
  dynamo_entities: DynamoEntity[];
  file_stats: { total_files: number; ts_files: number; go_files: number };
}

// ─── File-system helpers ─────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'graphify-output', 'playwright-report', 'bootstrap']);

function walkDir(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        results.push(...walkDir(full, exts));
      }
    } else if (entry.isFile() && exts.includes(extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

function rel(p: string): string {
  return relative(ROOT, p).replace(/\\/g, '/');
}

function readSafe(p: string): string {
  try { return readFileSync(p, 'utf-8'); }
  catch { return ''; }
}

// ─── TypeScript import parser ────────────────────────────────────────────────

interface ImportEntry {
  importedFrom: string; // raw import specifier
  symbols: string[];
  resolvedFile?: string; // resolved relative workspace path
}

function parseImports(content: string, fromFile: string): ImportEntry[] {
  const results: ImportEntry[] = [];
  // Matches: import { A, B } from '...' | import Foo from '...' | import type { X } from '...'
  const re = /^\s*import\s+(?:type\s+)?(?:(?:\{([^}]+)\}|(\w+))(?:\s*,\s*(?:\{([^}]+)\}|(\w+)))?)\s+from\s+['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const named = [m[1], m[3]].filter(Boolean).join(',').split(',').map(s => s.trim().replace(/\s+as\s+\w+/, '').trim()).filter(Boolean);
    const defaults = [m[2], m[4]].filter(Boolean);
    const from = m[5];
    const symbols = [...new Set([...named, ...defaults])];
    const entry: ImportEntry = { importedFrom: from, symbols };
    // Resolve workspace path
    if (from.startsWith('@/')) {
      entry.resolvedFile = `src/${from.slice(2)}`;
    } else if (from.startsWith('./') || from.startsWith('../')) {
      const base = dirname(fromFile);
      let resolved = rel(resolve(ROOT, base, from));
      // Try adding extension if not present
      if (!extname(resolved)) resolved += '.tsx';
      entry.resolvedFile = resolved;
    }
    results.push(entry);
  }
  return results;
}

// ─── Go router parser ────────────────────────────────────────────────────────

function parseGoRouter(routerPath: string): ApiEndpoint[] {
  const content = readSafe(routerPath);
  const lines = content.split('\n');
  const endpoints: ApiEndpoint[] = [];

  // Track current auth level by scanning for group boundaries
  // We use a simple stack to track context
  let authLevel: 'public' | 'authenticated' | 'admin' = 'public';
  const authStack: ('public' | 'authenticated' | 'admin')[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.includes('auth.AdminMiddleware')) {
      authStack.push('admin');
      authLevel = 'admin';
    } else if (line.match(/auth\.Middleware[^s]/) || line === 'r.Use(auth.Middleware)') {
      authStack.push('authenticated');
      authLevel = 'authenticated';
    } else if (line.startsWith('r.Group(') || line.startsWith('r.Route(')) {
      authStack.push(authLevel); // propagate current level into the group
    } else if (line === '})') {
      if (authStack.length) authStack.pop();
      authLevel = authStack.length ? authStack[authStack.length - 1] : 'public';
    }

    // Route registrations: r.Get/Post/Put/Delete/Patch
    // Also handles r.With(...).Get(...)
    const routeRe = /r\.(?:With\([^)]+\)\.)?(Get|Post|Put|Delete|Patch)\("([^"]+)",\s*(?:h\.(\w+)|func)/;
    const rm = line.match(routeRe);
    if (rm) {
      // Prefix already includes /api from parent router
      let fullPath = rm[2];
      // Detect if we're inside r.Route("/admin", ...) by checking if authLevel is admin
      if (authLevel === 'admin' && !fullPath.startsWith('/api/admin') && !fullPath.startsWith('/admin')) {
        fullPath = `/admin${fullPath}`;
      }
      if (!fullPath.startsWith('/api')) fullPath = `/api${fullPath}`;

      endpoints.push({
        method: rm[1].toUpperCase(),
        path: fullPath,
        handler: rm[3] ?? 'anonymous',
        auth: authLevel,
        rateLimit: line.includes('RateLimitMiddleware'),
      });
    }
  }

  return endpoints;
}

// ─── TypeScript type parser ──────────────────────────────────────────────────

function parseTsTypes(content: string): TsTypeNode[] {
  const types: TsTypeNode[] = [];

  // Interfaces (including multi-line)
  const ifaceRe = /export interface (\w+)(?:<[^>]*>)?\s*(?:extends[^{]*)?\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ifaceRe.exec(content)) !== null) {
    const fields = m[2].split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//') && !l.startsWith('*') && l.includes(':'))
      .map(l => l.split(':')[0].trim().replace(/[?!]$/, '').replace(/^readonly\s+/, ''))
      .filter(f => f && !f.includes(' '));
    types.push({ name: m[1], kind: 'interface', fields });
  }

  // Type aliases
  const typeRe = /export type (\w+)\s*(?:<[^>]*>)?\s*=/g;
  while ((m = typeRe.exec(content)) !== null) {
    if (!types.find(t => t.name === m![1])) {
      types.push({ name: m[1], kind: 'type_alias', fields: [] });
    }
  }

  return types;
}

// ─── Go model parser ─────────────────────────────────────────────────────────

function parseGoModels(content: string): GoModel[] {
  const models: GoModel[] = [];
  const structRe = /type (\w+) struct \{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = structRe.exec(content)) !== null) {
    const fields = m[2].split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//') && /^[A-Z]/.test(l))
      .map(l => l.split(/\s+/)[0]);
    models.push({ name: m[1], fields });
  }
  return models;
}

// ─── Classify source files ───────────────────────────────────────────────────

function classifyFile(p: string): NodeType | null {
  const r = rel(p);
  if (r.startsWith('src/pages/admin/')) return 'page';
  if (r.startsWith('src/pages/')) return 'page';
  if (r.startsWith('src/components/ui/')) return null; // skip shadcn primitives from node list
  if (r.startsWith('src/components/')) return 'component';
  if (r.startsWith('src/stores/')) return 'store';
  if (r.startsWith('src/hooks/')) return 'hook';
  if (r.startsWith('src/lib/')) return 'lib';
  if (r.startsWith('src/types/')) return 'ts_type';
  return null;
}

function nodeId(type: NodeType, label: string): string {
  return `${type}:${label}`;
}

function fileLabel(p: string): string {
  return basename(p).replace(/\.(tsx?|go)$/, '');
}

// ─── DynamoDB entity definitions ─────────────────────────────────────────────
// Hard-coded from the architecture spec (single-source-of-truth: template.yaml / copilot instructions)

const DYNAMO_ENTITIES: DynamoEntity[] = [
  { entity: 'Product', pk: 'PRODUCT#<id>', sk: 'PRODUCT#<id>', gsi1pk: 'CAT#<catId>', gsi1sk: 'PRODUCT#<id>', keyFields: ['productId', 'name', 'category', 'price', 'stock', 'isActive'] },
  { entity: 'Category', pk: 'CAT#<id>', sk: 'CAT#<id>', keyFields: ['categoryId', 'name', 'sortOrder', 'isActive'] },
  { entity: 'User', pk: 'USER#<id>', sk: 'USER#<id>', gsi1pk: 'USER#<email>', gsi1sk: '<email>', keyFields: ['userId', 'email', 'name', 'role', 'userType'] },
  { entity: 'Order', pk: 'ORDER#<id>', sk: 'ORDER#<id>', gsi1pk: 'USER#<userId>', gsi1sk: 'ORDER#<date>', keyFields: ['orderId', 'orderNumber', 'userId', 'status', 'paymentStatus', 'total'] },
  { entity: 'Coupon', pk: 'COUPON#<code>', sk: 'COUPON#<code>', keyFields: ['couponId', 'code', 'discountPercent', 'isActive', 'expiresAt'] },
  { entity: 'Config', pk: 'CONFIG', sk: 'CONFIG', keyFields: ['storeName', 'primaryColor', 'taxRate', 'stripePublishableKey'] },
  { entity: 'Refund', pk: 'REFUND#<id>', sk: 'REFUND#<id>', gsi1pk: 'ORDER#<orderId>', gsi1sk: 'REFUND#<id>', keyFields: ['refundId', 'orderId', 'amountCents', 'status'] },
  { entity: 'Dealer', pk: 'DEALER#<id>', sk: 'DEALER#<id>', keyFields: ['dealerId', 'name', 'email', 'isActive'] },
  { entity: 'Rewards', pk: 'REWARDS#<userId>', sk: 'REWARDS#<userId>', keyFields: ['userId', 'pointsBalance', 'totalEarned', 'totalRedeemed'] },
];

// ─── Frontend routes ─────────────────────────────────────────────────────────

const FRONTEND_ROUTES = [
  { path: '/', page: 'HomePage', layout: 'StoreLayout', auth: false },
  { path: '/products', page: 'ProductsPage', layout: 'StoreLayout', auth: false },
  { path: '/products/:productId', page: 'ProductDetailPage', layout: 'StoreLayout', auth: false },
  { path: '/categories', page: 'CategoriesPage', layout: 'StoreLayout', auth: false },
  { path: '/cart', page: 'CartPage', layout: 'StoreLayout', auth: false },
  { path: '/checkout', page: 'CheckoutPage', layout: 'StoreLayout', auth: true },
  { path: '/checkout/success', page: 'CheckoutSuccessPage', layout: 'StoreLayout', auth: true },
  { path: '/checkout/failure', page: 'CheckoutFailurePage', layout: 'StoreLayout', auth: false },
  { path: '/orders', page: 'OrdersPage', layout: 'StoreLayout', auth: true },
  { path: '/orders/:orderId', page: 'OrderDetailPage', layout: 'StoreLayout', auth: true },
  { path: '/profile', page: 'ProfilePage', layout: 'StoreLayout', auth: true },
  { path: '/login', page: 'LoginPage', layout: 'StoreLayout', auth: false },
  { path: '/signup', page: 'SignupPage', layout: 'StoreLayout', auth: false },
  { path: '/contact', page: 'ContactPage', layout: 'StoreLayout', auth: false },
  { path: '/auth/callback', page: 'AuthCallbackPage', layout: 'StoreLayout', auth: false },
  { path: '/admin', page: 'AdminDashboard', layout: 'AdminLayout', auth: true },
  { path: '/admin/products', page: 'AdminProducts', layout: 'AdminLayout', auth: true },
  { path: '/admin/categories', page: 'AdminCategories', layout: 'AdminLayout', auth: true },
  { path: '/admin/orders', page: 'AdminOrders', layout: 'AdminLayout', auth: true },
  { path: '/admin/users', page: 'AdminUsers', layout: 'AdminLayout', auth: true },
  { path: '/admin/coupons', page: 'AdminCoupons', layout: 'AdminLayout', auth: true },
  { path: '/admin/config', page: 'AdminConfig', layout: 'AdminLayout', auth: true },
  { path: '/admin/dealers', page: 'AdminDealers', layout: 'AdminLayout', auth: true },
  { path: '/admin/refunds', page: 'AdminRefunds', layout: 'AdminLayout', auth: true },
  { path: '/admin/notifications', page: 'AdminNotifications', layout: 'AdminLayout', auth: true },
];

// ─── Build graph ─────────────────────────────────────────────────────────────

function buildGraph(): KnowledgeGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const addedNodes = new Set<string>();

  function addNode(node: GraphNode) {
    if (!addedNodes.has(node.id)) {
      nodes.push(node);
      addedNodes.add(node.id);
    }
  }

  // ── Frontend source files ──
  const tsFiles = walkDir(join(ROOT, 'src'), ['.ts', '.tsx']);
  let tsCount = 0;

  for (const file of tsFiles) {
    const type = classifyFile(file);
    if (!type || type === 'ts_type') continue; // types handled separately

    tsCount++;
    const label = fileLabel(file);
    const id = nodeId(type, label);
    addNode({ id, type, label, path: rel(file) });

    // Parse imports to build edges
    const content = readSafe(file);
    const imports = parseImports(content, rel(file));

    for (const imp of imports) {
      if (!imp.resolvedFile) continue; // skip external packages

      // Try to find a matching node
      const targetLabel = basename(imp.resolvedFile).replace(/\.(tsx?|go)$/, '');
      const targetFile = tsFiles.find(f => {
        const r = rel(f);
        return r === imp.resolvedFile ||
          r === imp.resolvedFile.replace(/\.tsx$/, '.ts') ||
          r === imp.resolvedFile.replace(/\.ts$/, '.tsx') ||
          r.replace(/\.(tsx?)$/, '') === imp.resolvedFile.replace(/\.(tsx?)$/, '');
      });

      if (targetFile) {
        const targetType = classifyFile(targetFile);
        if (targetType && targetType !== 'ts_type') {
          const targetId = nodeId(targetType, targetLabel);
          addNode({ id: targetId, type: targetType, label: targetLabel, path: rel(targetFile) });
          edges.push({ source: id, target: targetId, relation: 'imports' });
        }
      }

      // Detect store usage
      if (imp.resolvedFile.includes('/stores/')) {
        const storeLabel = basename(imp.resolvedFile).replace(/\.(tsx?)$/, '');
        const storeId = nodeId('store', storeLabel);
        if (addedNodes.has(storeId)) {
          edges.push({ source: id, target: storeId, relation: 'uses_store' });
        }
      }

      // Detect hook usage
      if (imp.resolvedFile.includes('/hooks/')) {
        const hookLabel = basename(imp.resolvedFile).replace(/\.(tsx?)$/, '');
        const hookId = nodeId('hook', hookLabel);
        if (addedNodes.has(hookId)) {
          edges.push({ source: id, target: hookId, relation: 'uses_hook' });
        }
      }
    }
  }

  // ── Frontend routes ──
  for (const route of FRONTEND_ROUTES) {
    const routeId = `frontend_route:${route.path}`;
    addNode({
      id: routeId,
      type: 'frontend_route',
      label: route.path,
      meta: { page: route.page, layout: route.layout, auth: route.auth },
    });
    const pageId = nodeId('page', route.page);
    if (addedNodes.has(pageId)) {
      edges.push({ source: routeId, target: pageId, relation: 'maps_to_route' });
    }
  }

  // ── TypeScript types ──
  const typesFile = join(ROOT, 'src/types/index.ts');
  const tsTypesContent = readSafe(typesFile);
  const tsTypes = parseTsTypes(tsTypesContent);

  for (const t of tsTypes) {
    const id = `ts_type:${t.name}`;
    addNode({ id, type: 'ts_type', label: t.name, path: 'src/types/index.ts', meta: { kind: t.kind, fields: t.fields } });
  }

  // ── Go models ──
  const modelsFile = join(ROOT, 'backend/internal/models/models.go');
  const goFiles = walkDir(join(ROOT, 'backend'), ['.go']);
  let goCount = 0;
  const goModels: GoModel[] = [];

  for (const file of goFiles) {
    goCount++;
    const content = readSafe(file);
    goModels.push(...parseGoModels(content));
  }

  // Deduplicate models
  const seenModels = new Set<string>();
  const uniqueModels = goModels.filter(m => {
    if (seenModels.has(m.name)) return false;
    seenModels.add(m.name);
    return true;
  });

  for (const model of uniqueModels) {
    const id = `go_model:${model.name}`;
    addNode({ id, type: 'go_model', label: model.name, meta: { fields: model.fields } });
  }

  // ── API endpoints ──
  const routerFile = join(ROOT, 'backend/internal/router/router.go');
  const endpoints = parseGoRouter(routerFile);

  for (const ep of endpoints) {
    const id = `api_endpoint:${ep.method}:${ep.path}`;
    addNode({ id, type: 'api_endpoint', label: `${ep.method} ${ep.path}`, meta: { method: ep.method, path: ep.path, auth: ep.auth, handler: ep.handler, rateLimit: ep.rateLimit ?? false } });

    // Edge to handler
    const handlerId = `go_handler:${ep.handler}`;
    addNode({ id: handlerId, type: 'go_handler', label: ep.handler });
    edges.push({ source: id, target: handlerId, relation: 'handled_by' });

    // Infer model relationship from handler name
    const handlerLower = ep.handler.toLowerCase();
    for (const model of uniqueModels) {
      if (handlerLower.includes(model.name.toLowerCase()) || handlerLower.includes(model.name.toLowerCase().replace('request', '').replace('response', ''))) {
        edges.push({ source: handlerId, target: `go_model:${model.name}`, relation: 'uses_model' });
        break;
      }
    }
  }

  // ── DynamoDB entities ──
  for (const entity of DYNAMO_ENTITIES) {
    const id = `dynamo_entity:${entity.entity}`;
    addNode({ id, type: 'dynamo_entity', label: entity.entity, meta: { pk: entity.pk, sk: entity.sk, gsi1pk: entity.gsi1pk, gsi1sk: entity.gsi1sk, keyFields: entity.keyFields } });

    // Link TS type → DynamoDB entity
    const tsTypeId = `ts_type:${entity.entity}`;
    if (addedNodes.has(tsTypeId)) {
      edges.push({ source: tsTypeId, target: id, relation: 'stored_as' });
    }

    // Link Go model → DynamoDB entity
    const goModelId = `go_model:${entity.entity}`;
    if (addedNodes.has(goModelId)) {
      edges.push({ source: goModelId, target: id, relation: 'stored_as' });
    }
  }

  const fileStats = {
    total_files: tsCount + goCount,
    ts_files: tsCount,
    go_files: goCount,
  };

  return {
    generated_at: new Date().toISOString(),
    project: 'shopreturngifts-platform',
    repo_root: ROOT,
    stack: {
      frontend: 'React 18 + Vite + TypeScript 5',
      styling: 'Tailwind CSS + shadcn/ui + Radix UI',
      state: 'Zustand (persisted) + TanStack Query (server)',
      routing: 'React Router v6',
      backend: 'Go 1.22 + Chi + AWS Lambda (ARM64)',
      database: 'DynamoDB (single-table, pay-per-request)',
      auth: 'AWS Cognito + JWT',
      payments: 'Stripe (Payment Intents)',
      storage: 'AWS S3 + CloudFront',
      infra: 'AWS SAM',
    },
    nodes,
    edges,
    api_endpoints: endpoints,
    frontend_routes: FRONTEND_ROUTES,
    ts_types: tsTypes,
    go_models: uniqueModels,
    dynamo_entities: DYNAMO_ENTITIES,
    file_stats: fileStats,
  };
}

// ─── Markdown generator ──────────────────────────────────────────────────────

function buildMarkdown(g: KnowledgeGraph): string {
  const lines: string[] = [];

  const h1 = (t: string) => lines.push(`# ${t}\n`);
  const h2 = (t: string) => lines.push(`## ${t}\n`);
  const h3 = (t: string) => lines.push(`### ${t}\n`);
  const p = (t: string) => lines.push(`${t}\n`);
  const sep = () => lines.push('---\n');
  const li = (t: string) => lines.push(`- ${t}`);
  const table = (headers: string[], rows: string[][]) => {
    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
    for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
    lines.push('');
  };

  h1('KiranaBandi Platform — LLM Knowledge Graph');
  p(`> Auto-generated by \`graphify\` on ${g.generated_at}`);
  p(`> **Do not edit manually.** Re-generate with \`bun run graphify\`.`);
  sep();

  // ── Project overview ──
  h2('1. Project Overview');
  p('**KiranaBandi** is a config-driven, serverless e-commerce platform for a retail store in Phoenix, Arizona, USA.');
  p('**Business rules:** Currency USD, Timezone America/Phoenix (MST, no DST), Phone format +1XXXXXXXXXX, Date format MM/DD/YYYY, ZIP 5-digit US, Tax = Arizona state + Maricopa County.');
  p('**Architecture:** React SPA (S3 + CloudFront) → API Gateway → Go Lambda → DynamoDB / Cognito / S3 / Stripe.');

  h2('2. Tech Stack');
  const stackRows = Object.entries(g.stack).map(([k, v]) => [k, v]);
  table(['Layer', 'Technology'], stackRows);

  h2('3. File Statistics');
  p(`- **Total source files analysed:** ${g.file_stats.total_files}`);
  p(`- **TypeScript/React files:** ${g.file_stats.ts_files}`);
  p(`- **Go files:** ${g.file_stats.go_files}`);
  sep();

  // ── Data models ──
  h2('4. Data Models');

  h3('4.1 TypeScript Interfaces & Types (`src/types/index.ts`)');
  const interfaces = g.ts_types.filter(t => t.kind === 'interface');
  const typeAliases = g.ts_types.filter(t => t.kind === 'type_alias');

  for (const iface of interfaces) {
    p(`**\`${iface.name}\`** — fields: \`${iface.fields.join(', ') || 'n/a'}\``);
  }
  if (typeAliases.length) {
    p('');
    p(`**Type aliases:** ${typeAliases.map(t => `\`${t.name}\``).join(', ')}`);
  }

  h3('4.2 Go Models (`backend/internal/models/models.go`)');
  table(
    ['Struct', 'Fields'],
    g.go_models.map(m => [m.name, m.fields.slice(0, 8).join(', ') + (m.fields.length > 8 ? ' …' : '')])
  );

  h3('4.3 DynamoDB Entity Patterns (single-table `shopreturngifts-{stage}`)');
  table(
    ['Entity', 'PK', 'SK', 'GSI1PK', 'GSI1SK', 'Key Fields'],
    g.dynamo_entities.map(e => [
      e.entity,
      `\`${e.pk}\``,
      `\`${e.sk}\``,
      e.gsi1pk ? `\`${e.gsi1pk}\`` : '—',
      e.gsi1sk ? `\`${e.gsi1sk}\`` : '—',
      e.keyFields.join(', '),
    ])
  );
  sep();

  // ── API reference ──
  h2('5. API Endpoints Reference');

  const byAuth: Record<string, ApiEndpoint[]> = { public: [], authenticated: [], admin: [] };
  for (const ep of g.api_endpoints) byAuth[ep.auth].push(ep);

  const endpointRows = (eps: ApiEndpoint[]) =>
    table(
      ['Method', 'Path', 'Handler', 'Rate Limited'],
      eps.map(ep => [
        `\`${ep.method}\``,
        `\`${ep.path}\``,
        `\`${ep.handler}\``,
        ep.rateLimit ? '✓' : '',
      ])
    );

  h3('5.1 Public Endpoints');
  endpointRows(byAuth.public);

  h3('5.2 Authenticated Endpoints (Bearer JWT required)');
  endpointRows(byAuth.authenticated);

  h3('5.3 Admin Endpoints (Bearer JWT + Cognito `admin` group)');
  endpointRows(byAuth.admin);
  sep();

  // ── Frontend routes ──
  h2('6. Frontend Routes');
  table(
    ['URL Path', 'Page Component', 'Layout', 'Auth Required'],
    g.frontend_routes.map(r => [
      `\`${r.path}\``,
      r.page,
      r.layout,
      r.auth ? '✓' : '',
    ])
  );
  sep();

  // ── Component inventory ──
  h2('7. Component & Page Inventory');

  h3('7.1 Pages');
  const pageNodes = g.nodes.filter(n => n.type === 'page');
  table(
    ['Component', 'File Path'],
    pageNodes.map(n => [n.label, n.path ?? ''])
  );

  h3('7.2 Shared Components');
  const compNodes = g.nodes.filter(n => n.type === 'component');
  table(
    ['Component', 'File Path'],
    compNodes.map(n => [n.label, n.path ?? ''])
  );

  h3('7.3 Hooks');
  const hookNodes = g.nodes.filter(n => n.type === 'hook');
  table(
    ['Hook', 'File Path'],
    hookNodes.map(n => [n.label, n.path ?? ''])
  );

  h3('7.4 Zustand Stores');
  const storeNodes = g.nodes.filter(n => n.type === 'store');
  for (const s of storeNodes) {
    p(`- **\`${s.label}\`** (\`${s.path}\`)`);
  }
  p('');
  p('- **`authStore`** — user, token, isAuthenticated, isAdmin, setAuth(), logout(), updateProfile()');
  p('- **`cartStore`** — items, isOpen, addItem(), removeItem(), updateQuantity(), clearCart(), subtotal(), itemCount(), toggleCart()');

  h3('7.5 Lib Utilities');
  const libNodes = g.nodes.filter(n => n.type === 'lib');
  table(
    ['Module', 'File Path'],
    libNodes.map(n => [n.label, n.path ?? ''])
  );
  sep();

  // ── Import dependency graph ──
  h2('8. Import Dependency Graph (abbreviated)');
  p('Edges where source imports from target (external npm packages excluded):');
  const importEdges = g.edges.filter(e => e.relation === 'imports').slice(0, 80);
  for (const e of importEdges) {
    li(`\`${e.source}\` → \`${e.target}\``);
  }
  if (g.edges.filter(e => e.relation === 'imports').length > 80) {
    p(`\n_… and ${g.edges.filter(e => e.relation === 'imports').length - 80} more import edges (see graph.json)_`);
  }
  sep();

  // ── Backend internals ──
  h2('9. Backend Architecture');

  h3('9.1 File Layout');
  p('```');
  p('backend/');
  p('├── cmd/api/main.go          — Lambda entry point, AWS client init');
  p('├── internal/handlers/       — HTTP handler functions (Chi)');
  p('│   ├── handlers.go          — Core: auth, products, categories, orders, users, config, coupons');
  p('│   ├── dealers.go           — Dealer management handlers');
  p('│   ├── rewards.go           — Rewards program handlers');
  p('│   ├── contact.go           — Contact form handler');
  p('│   ├── oauth.go             — Google/Facebook OAuth handlers');
  p('│   └── openapi.go           — OpenAPI spec + Swagger UI');
  p('├── internal/middleware/');
  p('│   ├── auth.go              — JWT verification, admin group check, context injection');
  p('│   └── ratelimit.go         — Token-bucket rate limiter (per IP)');
  p('├── internal/models/models.go — Request/response Go structs');
  p('├── internal/router/router.go — Chi router: routes, CORS, security headers');
  p('└── internal/store/');
  p('    ├── dynamodb.go          — DynamoDB CRUD + Cognito + S3 pre-signed URLs');
  p('    ├── oauth.go             — OAuth token exchange helpers');
  p('    └── rewards.go           — Rewards ledger operations');
  p('```');

  h3('9.2 Handler → Endpoint Mapping');
  const handlerNodes = g.nodes.filter(n => n.type === 'go_handler');
  p(`Total handlers: **${handlerNodes.length}**`);
  const handlerEdges = g.edges.filter(e => e.relation === 'handled_by');
  table(
    ['Handler', 'Method', 'Path', 'Auth'],
    handlerEdges.map(e => {
      const ep = g.api_endpoints.find(ep => `go_handler:${ep.handler}` === e.target);
      return [
        e.target.replace('go_handler:', ''),
        ep ? `\`${ep.method}\`` : '',
        ep ? `\`${ep.path}\`` : '',
        ep ? ep.auth : '',
      ];
    })
  );

  h3('9.3 Middleware Chain');
  p('Every request: `Logger → Recoverer → RequestID → SecurityHeaders → RequestSize(2MB) → CORS`');
  p('Auth routes: `+ RateLimit(10/min)`');
  p('Authenticated routes: `+ auth.Middleware` (JWT validation, user ID injected into context)');
  p('Admin routes: `+ auth.Middleware + auth.AdminMiddleware` (Cognito group check)');
  sep();

  // ── Infrastructure ──
  h2('10. Infrastructure (AWS SAM)');
  p('**Template:** `template.yaml`');
  p('**Resources:**');
  li('`DynamoDB` — single table `shopreturngifts-{stage}`, PK/SK + GSI1, TTL on `expiresAt`');
  li('`Lambda` — Go binary (`bootstrap`), ARM64, 512 MB, 30s timeout');
  li('`API Gateway` — HTTP API, `/prod/api/*`');
  li('`Cognito` — User Pool + App Client, `admin` group for RBAC');
  li('`S3` — assets bucket (images, invoices), artefacts bucket');
  li('`CloudFront` — CDN for static frontend');
  p('');
  p('**Stages:** `dev` | `staging` | `prod` — each has isolated DynamoDB table, Cognito pool, Lambda.');
  p('**Environment variables on Lambda:** `TABLE_NAME`, `S3_BUCKET`, `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, `AWS_REGION`, `STRIPE_SECRET_KEY`, `ALLOWED_ORIGINS`');
  sep();

  // ── CI/CD ──
  h2('11. CI/CD (`.github/workflows/deploy.yml`)');
  p('**Trigger:** push/PR to `main`');
  p('**Jobs:**');
  li('`test` — `npm test` (Vitest) + `cd backend && make test` (Go)');
  li('`frontend` — `npm run build` → `aws s3 sync dist/` → CloudFront invalidation (push to main only)');
  li('`backend` — `make build` (GOOS=linux GOARCH=arm64 CGO_ENABLED=0) → `sam deploy` (push to main only)');
  sep();

  // ── Development setup ──
  h2('12. Local Development');
  p('```bash');
  p('# Frontend (port 8080)');
  p('bun install && bun run dev');
  p('');
  p('# Backend');
  p('cd backend && go mod tidy && make build');
  p('');
  p('# Tests');
  p('bun run test            # Vitest unit tests');
  p('cd backend && make test # Go tests');
  p('bunx playwright test    # E2E tests');
  p('');
  p('# Re-generate this graph');
  p('bun run graphify');
  p('```');
  p('**Key env vars:** `VITE_API_BASE_URL`, `VITE_STRIPE_PUBLIC_KEY`');
  sep();

  // ── Conventions ──
  h2('13. Code Conventions & Constraints');
  p('- **No hardcoded UI labels** — all read from `StoreConfig` (S3-backed)');
  p('- **TypeScript strict mode** — avoid `any`; use Zod for runtime validation');
  p('- **State:** Zustand for persisted client state; React Query for server state');
  p('- **Styling:** Tailwind CSS only; no inline styles or CSS-in-JS');
  p('- **API calls:** always via `useQuery`/`useMutation`, never raw `fetch` in render');
  p('- **Go:** every handler must check JSON decode error; validate inputs; use `writeError()`');
  p('- **DynamoDB:** single table, soft-delete (`isActive` flag), TTL for time-sensitive data');
  p('- **Secrets:** never hardcode; read from `os.Getenv()` (Go) or `import.meta.env` (frontend)');
  p('- **Build target:** `GOOS=linux GOARCH=arm64 CGO_ENABLED=0` for Lambda');
  sep();

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('🔍  Analysing KiranaBandi codebase…');

  mkdirSync(OUT_DIR, { recursive: true });

  const graph = buildGraph();

  // Write graph.json
  const graphPath = join(OUT_DIR, 'graph.json');
  writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf-8');
  console.log(`✅  graph.json  — ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

  // Write llm-context.md
  const md = buildMarkdown(graph);
  const mdPath = join(OUT_DIR, 'llm-context.md');
  writeFileSync(mdPath, md, 'utf-8');

  const lineCount = md.split('\n').length;
  const charCount = md.length;
  console.log(`✅  llm-context.md  — ${lineCount} lines, ~${Math.round(charCount / 4)} tokens (est.)`);

  console.log(`\n📁  Output: ${relative(ROOT, OUT_DIR)}/`);
  console.log(`   graph.json      — knowledge graph (nodes + edges + typed metadata)`);
  console.log(`   llm-context.md  — flat Markdown digest for LLM context windows`);

  // Summary stats
  const byType: Record<string, number> = {};
  for (const n of graph.nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;
  console.log('\n📊  Node breakdown:');
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type.padEnd(20)} ${count}`);
  }
  console.log(`\n   API endpoints: ${graph.api_endpoints.length} (${graph.api_endpoints.filter(e => e.auth === 'public').length} public, ${graph.api_endpoints.filter(e => e.auth === 'authenticated').length} authenticated, ${graph.api_endpoints.filter(e => e.auth === 'admin').length} admin)`);
}

main();
