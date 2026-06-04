import { Request, Response } from 'express';
import { productService } from '../services/product.service';
import { sendSuccess, sendPaginated, sendError } from '../../../utils/response';
import { getImageUrl } from '../../../utils/upload';

const parseArray = (val: any): string[] | undefined => {
  if (!val) return undefined;
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : undefined; } catch {}
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
  return undefined;
};

export class ProductController {
  async getProducts(req: Request, res: Response) {
    const {
      page, limit, search, categoryId, categorySlug, collectionSlug,
      minPrice, maxPrice, sizes, colors, brands, isFeatured, isTrending,
      isNewArrival, isBestSeller, inStock, rating, sortBy,
    } = req.query as Record<string, string>;

    const parseBool = (v: string | undefined) =>
      v === 'true' ? true : v === 'false' ? false : undefined;

    const result = await productService.getProducts({
      page: Number(page), limit: Number(limit), search, categoryId, categorySlug, collectionSlug,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      sizes: sizes?.split(','),
      colors: colors?.split(','),
      brands: brands?.split(','),
      isFeatured:   parseBool(isFeatured),
      isTrending:   parseBool(isTrending),
      isNewArrival: parseBool(isNewArrival),
      isBestSeller: parseBool(isBestSeller),
      inStock:      inStock === 'true' ? true : undefined,
      rating: rating ? Number(rating) : undefined,
      sortBy: sortBy as any,
    });

    return sendPaginated(res, result.products, result.total, result.page, result.limit);
  }

  async getProductBySlug(req: Request, res: Response) {
    const { slug } = req.params;
    const product = await productService.getProductBySlug(slug);
    return sendSuccess(res, product, 'Product fetched');
  }

  async createProduct(req: Request, res: Response) {
    const files = req.files as Express.Multer.File[] | undefined;
    const images = files?.map((file, index) => ({
      url: getImageUrl(file.path),
      altText: req.body.name,
      isPrimary: index === 0,
      sortOrder: index,
    }));

    const body = { ...req.body, images };
    body.tags = parseArray(body.tags);
    body.collectionIds = parseArray(body.collectionIds);

    const product = await productService.createProduct(body);
    return sendSuccess(res, product, 'Product created', 201);
  }

  async getProductById(req: Request, res: Response) {
    const { id } = req.params;
    const product = await productService.getProductById(id);
    return sendSuccess(res, product, 'Product fetched');
  }

  async updateProduct(req: Request, res: Response) {
    const { id } = req.params;
    const files = req.files as Express.Multer.File[] | undefined;
    const newImages = files?.map((file, index) => ({
      url: getImageUrl(file.path),
      altText: req.body.name || '',
      isPrimary: index === 0,   // first upload is tentatively primary; service auto-demotes if one already exists
      sortOrder: index,
    }));

    const removeImageIds = req.body.removeImageIds
      ? (typeof req.body.removeImageIds === 'string' ? JSON.parse(req.body.removeImageIds) : req.body.removeImageIds)
      : [];

    const body = { ...req.body, newImages, removeImageIds };
    body.tags = parseArray(body.tags);
    body.collectionIds = parseArray(body.collectionIds);

    const product = await productService.updateProduct(id, body);
    return sendSuccess(res, product, 'Product updated');
  }

  async deleteProduct(req: Request, res: Response) {
    const { id } = req.params;
    await productService.deleteProduct(id);
    return sendSuccess(res, null, 'Product deleted');
  }

  async getFeaturedProducts(req: Request, res: Response) {
    const products = await productService.getFeaturedProducts(Number(req.query.limit) || 8);
    return sendSuccess(res, products, 'Featured products');
  }

  async getTrendingProducts(req: Request, res: Response) {
    const products = await productService.getTrendingProducts(Number(req.query.limit) || 8);
    return sendSuccess(res, products, 'Trending products');
  }

  async getNewArrivals(req: Request, res: Response) {
    const products = await productService.getNewArrivals(Number(req.query.limit) || 8);
    return sendSuccess(res, products, 'New arrivals');
  }

  async getBestSellers(req: Request, res: Response) {
    const products = await productService.getBestSellers(Number(req.query.limit) || 8);
    return sendSuccess(res, products, 'Best sellers');
  }

  async search(req: Request, res: Response) {
    const { q, limit } = req.query as Record<string, string>;
    if (!q) return sendError(res, 'Search query required', 400);
    const products = await productService.searchProducts(q, Number(limit) || 10);
    return sendSuccess(res, products, 'Search results');
  }

  // ── Variant CRUD ──────────────────────────────────────────────

  async getVariants(req: Request, res: Response) {
    const { id } = req.params;
    const variants = await productService.getVariants(id);
    return sendSuccess(res, variants, 'Variants fetched');
  }

  async createVariant(req: Request, res: Response) {
    const { id } = req.params;
    const variant = await productService.createVariant(id, req.body);
    return sendSuccess(res, variant, 'Variant created', 201);
  }

  async updateVariant(req: Request, res: Response) {
    const { id, vid } = req.params;
    const variant = await productService.updateVariant(id, vid, req.body);
    return sendSuccess(res, variant, 'Variant updated');
  }

  async deleteVariant(req: Request, res: Response) {
    const { id, vid } = req.params;
    await productService.deleteVariant(id, vid);
    return sendSuccess(res, null, 'Variant deleted');
  }
}

export const productController = new ProductController();
