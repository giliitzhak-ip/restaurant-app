import { brand, commerce } from "@/config/brand";
import { routes, siteUrl } from "@/config/site";
import type { Product } from "@/types/catalog";

export const absolute = (path: string) =>
  path.startsWith("http") ? path : `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;

const availabilityUrl: Record<Product["availability"], string> = {
  IN_STOCK: "https://schema.org/InStock",
  LOW_STOCK: "https://schema.org/LimitedAvailability",
  MADE_TO_ORDER: "https://schema.org/PreOrder",
  OUT_OF_STOCK: "https://schema.org/OutOfStock",
};

/** schema.org Product, including the per-m² price as the unit price. */
export function productJsonLd(product: Product, reviewCount = 0) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.sku,
    mpn: product.sku,
    brand: { "@type": "Brand", name: product.brand },
    category: product.categoryName,
    color: product.specs.colorName,
    material: product.specs.materialLabel,
    image: product.images.map((image) => absolute(image.url)),
    url: absolute(routes.product(product.slug)),
    offers: {
      "@type": "Offer",
      price: product.pricePerUnit.toFixed(2),
      priceCurrency: commerce.currency,
      availability: availabilityUrl[product.availability],
      itemCondition: "https://schema.org/NewCondition",
      url: absolute(routes.product(product.slug)),
      seller: { "@type": "Organization", name: brand.legal.companyName },
      ...(product.pricePerSqm
        ? {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: product.pricePerSqm.toFixed(2),
              priceCurrency: commerce.currency,
              unitCode: "MTK",
              referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MTK" },
            },
          }
        : {}),
    },
    ...(product.ratingCount > 0 && reviewCount >= 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.ratingAverage.toFixed(1),
            reviewCount: product.ratingCount,
          },
        }
      : {}),
  };
}

export function breadcrumbJsonLd(items: { label: string; href: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { label: "דף הבית", href: routes.home },
      ...items,
    ].map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: absolute(item.href),
    })),
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HomeGoodsStore",
    name: brand.name,
    alternateName: brand.nameLatin,
    url: siteUrl,
    telephone: brand.contact.phone,
    email: brand.contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: brand.contact.address,
      addressCountry: "IL",
    },
    image: absolute(brand.logo.wordmark),
    priceRange: "₪₪",
  };
}

export function itemListJsonLd(products: Product[], name: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absolute(routes.product(product.slug)),
      name: product.name,
    })),
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
