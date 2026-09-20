"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Download,
  Share2,
  Heart,
  Image as ImageIcon,
  RefreshCw,
  Redo2,
  ShoppingBag,
  Undo2,
  X,
} from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatArea, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useCart } from "@/features/cart/cart-provider";
import { useSessionUser } from "@/components/providers";
import { BrandMark } from "@/components/layout/brand-mark";
import {
  saveDesignAction,
  saveRenderAction,
  uploadRoomImageAction,
} from "@/server/actions/designs";
import type { ProductSwatch } from "@/types/catalog";
import type { RoomDesignRecord, SurfaceKind } from "@/types/design";
import { useDesigner } from "../hooks/use-designer";
import type { DesignObjectAsset, LedPathShape, LightingFixtureType } from "@/types/scene";
import { canvasToFile } from "../utils/image";
import { useScene } from "../scene/use-scene";
import {
  createCustomObject,
  createFixture,
  createFixtureBehind,
  createObjectFromAsset,
  type PhotoFrame,
} from "../scene/factory";
import { BillOfMaterials } from "./bill-of-materials";
import { CanvasStage } from "./canvas-stage";
import { ControlsPanel } from "./controls-panel";
import { CustomObjectDialog } from "./custom-object-dialog";
import { LayersPanel } from "./layers-panel";
import { LightingDrawer } from "./lighting-drawer";
import { ObjectLibraryDrawer } from "./object-library-drawer";
import { ProductDrawer } from "./product-drawer";
import { SaveDesignDialog } from "./save-design-dialog";
import { SceneOverlay } from "./scene-overlay";
import { UploadPanel } from "./upload-panel";

const warningCopy: Record<string, { title: string; body: string }> = {
  NO_FLOOR_DETECTED: {
    title: t.states.noFloorTitle,
    body: t.states.noFloorBody,
  },
  NO_WALL_DETECTED: { title: t.states.noWallTitle, body: t.states.noWallBody },
  LOW_LIGHT: { title: t.states.lowQualityTitle, body: t.states.lowQualityBody },
  BLURRY: { title: t.states.lowQualityTitle, body: t.states.lowQualityBody },
  LOW_RESOLUTION: {
    title: t.states.lowQualityTitle,
    body: t.states.lowQualityBody,
  },
};

export function DesignerShell({
  swatches,
  objectAssets,
  initialProductSlug,
  initialSurface,
  savedDesign,
}: {
  swatches: ProductSwatch[];
  /** The object library, read on the server so the drawer opens populated. */
  objectAssets: DesignObjectAsset[];
  initialProductSlug?: string;
  initialSurface?: SurfaceKind;
  savedDesign?: RoomDesignRecord | null;
}) {
  const controller = useDesigner({
    swatches,
    initialProductSlug,
    initialSurface,
    savedDesign,
  });
  const [compare, setCompare] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  /*
   * Five panels, one at a time on a phone and side by side on a desktop.
   * "Cladding" is the original texture picker; the other four are the scene.
   */
  const [panel, setPanel] = React.useState<
    "cladding" | "objects" | "lighting" | "layers" | "controls"
  >("cladding");
  const [customOpen, setCustomOpen] = React.useState(false);
  const [drawingShape, setDrawingShape] = React.useState<LedPathShape | null>(null);

  const scene = useScene(savedDesign?.scene ?? null);
  const { add } = useCart();
  const { toast } = useToast();
  const user = useSessionUser();
  const router = useRouter();

  const wallSurfaces = controller.surfaces.filter(
    (surface) => surface.mask.kind === "WALL",
  );
  const hasSelection = controller.selectedProducts.length > 0;

  /*
   * The frame every scene measurement is taken against: the photo's pixel
   * size and how wide the customer says the room is. Without it a 145cm
   * television is just a number.
   */
  const frame: PhotoFrame = {
    width: controller.image?.width ?? 1,
    height: controller.image?.height ?? 1,
    roomWidthM: controller.roomWidthM,
  };

  const activeSurfaceMask = controller.activeSurface?.mask ?? null;
  const floorMask =
    controller.surfaces.find((surface) => surface.mask.kind === "FLOOR")?.mask ?? null;

  /* ------------------------------ scene edits ----------------------------- */

  const addObject = (asset: DesignObjectAsset) => {
    scene.dispatch({
      type: "ADD_OBJECT",
      object: createObjectFromAsset({
        asset,
        scene: scene.scene,
        frame,
        // Wall pieces belong to the wall even when the floor is the active
        // surface, so a cladding change on either one leaves them alone.
        surfaceId:
          asset.snap === "FLOOR"
            ? (floorMask?.id ?? activeSurfaceMask?.id ?? null)
            : (controller.surfaces.find((surface) => surface.mask.kind === "WALL")?.mask
                .id ??
              activeSurfaceMask?.id ??
              null),
      }),
    });
    track("designer_add_object", { category: asset.category, sold: asset.soldOnSite });
    setPanel("objects");
  };

  const addFixture = (type: LightingFixtureType) => {
    /*
     * A strip "behind the television" is placed behind the television. If a
     * screen is selected, or there is exactly one in the room, the light
     * attaches to it and follows it from then on — which is what the name of
     * the fixture already promised.
     */
    const screens = scene.scene.objects.filter(
      (object) => object.type === "TV" || object.type === "TV_WALL",
    );
    const target =
      scene.selectedObject && screens.includes(scene.selectedObject)
        ? scene.selectedObject
        : screens.length === 1
          ? screens[0]
          : null;

    scene.dispatch({
      type: "ADD_FIXTURE",
      fixture:
        type === "LED_BEHIND_TV" && target
          ? createFixtureBehind(target, scene.scene, type)
          : createFixture({
              type,
              scene: scene.scene,
              surfaceId: activeSurfaceMask?.id ?? null,
            }),
    });
    track("designer_add_light", { type });
  };

  /**
   * A cut-out the customer made from their own photo.
   *
   * It carries no product id and never will: it is their sofa, not a
   * catalogue row, so it is drawn in the room and left out of the basket.
   */
  const addCustomObject = (result: { url: string; label: string; aspect: number }) => {
    scene.dispatch({
      type: "ADD_OBJECT",
      object: createCustomObject({
        url: result.url,
        label: result.label,
        aspect: result.aspect,
        scene: scene.scene,
        frame,
        surfaceId: activeSurfaceMask?.id ?? null,
      }),
    });
    track("designer_upload_object", {});
    setPanel("objects");
  };

  /* --------------------------------- save -------------------------------- */

  const saveDesign = async (name: string, options: { silent?: boolean } = {}) => {
    const canvas = controller.canvasRef.current;
    const image = controller.image;
    if (!canvas || !image) return;
    setSaving(true);

    try {
      let originalImageUrl = image.url;
      if (image.file) {
        const form = new FormData();
        form.set("image", image.file);
        const uploaded = await uploadRoomImageAction(form);
        if (uploaded.ok) originalImageUrl = uploaded.url;
      }

      let renderedImageUrl: string | null = null;
      const renderFile = await canvasToFile(canvas, "design.jpg");
      const renderForm = new FormData();
      renderForm.set("render", renderFile);
      const storedRender = await saveRenderAction(renderForm);
      if (storedRender.ok) renderedImageUrl = storedRender.url;

      const result = await saveDesignAction({
        id: controller.designId ?? undefined,
        name,
        originalImageUrl,
        renderedImageUrl,
        estimatedAreaSqm: controller.estimate.areaSqm,
        estimatedPrice: controller.estimate.price,
        analysis: controller.analysis,
        surfaces: controller.surfaces.map((surface) => ({
          surfaceId: surface.mask.id,
          kind: surface.mask.kind,
          label: surface.mask.label,
          productId: surface.productId,
          mask: surface.mask,
          settings: surface.settings,
          areaSqm: surface.areaSqm,
        })),
        // Objects, lighting and LED runs. The server re-checks every product
        // claim on the way in; what it stores is what may be sold.
        scene: scene.scene,
      });

      if (!result.ok) {
        toast({ tone: "error", title: t.states.errorTitle, description: t.states.errorBody });
        return;
      }

      track("save_design", {
        designId: result.design.id,
        products: controller.selectedProducts.length,
        areaSqm: controller.estimate.areaSqm,
      });
      controller.setDesignMeta({ designId: result.design.id, designName: name });
      setSaveOpen(false);

      // An autosave is not an event the customer asked to be told about.
      if (options.silent) return;

      toast({
        title: t.designer.designSaved,
        description: user ? t.account.designs : t.account.guestNote,
        action: user
          ? { label: t.account.designs, href: routes.account.designs }
          : undefined,
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  /*
   * Autosave.
   *
   * Only ever for a design the customer has *already* saved once. Saving
   * uploads the room photo, and doing that on their behalf before they asked
   * would quietly turn "let me try a colour" into "my living room is on your
   * server" — the opposite of what the privacy note on the upload screen
   * promises. Once they have chosen to save, keeping it current is what they
   * expect.
   *
   * Debounced, because every slider drag changes the settings.
   */
  const surfaceFingerprint = JSON.stringify(
    controller.surfaces.map((surface) => [
      surface.mask.id,
      surface.productId,
      surface.settings,
      Math.round(surface.areaSqm * 100),
    ]),
  );

  /*
   * The scene's own fingerprint, kept coarse on purpose: positions are
   * rounded to a thousandth so a two-pixel nudge does not count as a change
   * and re-upload the room photo.
   */
  const sceneFingerprint = JSON.stringify([
    scene.scene.objects.map((object) => [
      object.id,
      object.assetUrl,
      Math.round(object.position.x * 1000),
      Math.round(object.position.y * 1000),
      Math.round(object.width * 1000),
      Math.round(object.height * 1000),
      Math.round(object.rotation),
      object.flipX,
      object.layerIndex,
      object.locked,
      object.visible,
      Boolean(object.perspectivePoints),
    ]),
    scene.scene.lightingFixtures.length,
    scene.scene.ledPaths.length,
    scene.scene.layers.hidden,
  ]);

  React.useEffect(() => {
    if (!controller.designId || !controller.designName) return;
    if (typeof window === "undefined") return;
    // Never mid-drag: saving uploads a render, and a render taken halfway
    // through a gesture is a picture of a half-finished move.
    if (scene.gesturing) return;

    const handle = window.setTimeout(() => {
      void saveDesign(controller.designName, { silent: true });
    }, 2500);
    return () => window.clearTimeout(handle);
    // saveDesign closes over the current controller state by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    surfaceFingerprint,
    sceneFingerprint,
    scene.gesturing,
    controller.designId,
    controller.designName,
  ]);

  /* ------------------------------ add to cart ---------------------------- */

  /**
   * What is actually in this design, and what of it can be bought.
   *
   * Two lists, deliberately not merged. The claddings are priced by area from
   * the surfaces the customer chose. The objects are priced only when they
   * carry a product id that the library vouched for — and the rest are
   * illustrations, listed so the design reads as a whole but marked so nobody
   * expects them in the parcel.
   */
  const sellableItems = React.useMemo(
    () => scene.scene.objects.filter((object) => Boolean(object.productId)),
    [scene.scene.objects],
  );
  const illustrationItems = React.useMemo(
    () => scene.scene.objects.filter((object) => !object.productId),
    [scene.scene.objects],
  );

  const addSelectionToCart = async () => {
    for (const { surface, swatch } of controller.selectedProducts) {
      await add({
        productId: swatch.id,
        slug: swatch.slug,
        name: swatch.name,
        sqm: Math.max(0.5, surface.areaSqm),
        designId: controller.designId,
        designLabel: controller.designName || t.designer.shortTitle,
        silent: true,
      });
    }

    /*
     * Objects go in by the unit, and only the ones with a product behind
     * them. The cart action resolves the id against the catalogue again;
     * this check is so the button does not offer what the server will
     * refuse, not a substitute for it.
     */
    for (const object of sellableItems) {
      if (!object.productId) continue;
      await add({
        productId: object.productId,
        slug: object.productId,
        name: object.label,
        units: 1,
        designId: controller.designId,
        designLabel: controller.designName || t.designer.shortTitle,
        silent: true,
      });
    }

    const count = controller.selectedProducts.length + sellableItems.length;
    toast({
      title: t.product.added,
      description: `${count} מוצרים · ${formatArea(controller.estimate.areaSqm)}${
        illustrationItems.length
          ? ` · ${illustrationItems.length} פריטים להמחשה לא נוספו`
          : ""
      }`,
      action: { label: t.cart.checkout, href: routes.cart },
    });
  };

  /**
   * Shares the render.
   *
   * Uses the Web Share sheet when the browser can take a file — on a phone
   * that puts WhatsApp, Messages and Mail one tap away, which is where these
   * images actually go. Falls back to a WhatsApp link with the product names
   * and a link back to the designer.
   */
  const shareRender = async () => {
    const canvas = controller.canvasRef.current;
    if (!canvas) return;
    track("share_design", { products: controller.selectedProducts.length });

    const products = controller.selectedProducts.map(({ swatch }) => swatch.name).join(" · ");
    const text = `${t.designer.shareText} ${products}`;
    const pageUrl = typeof window === "undefined" ? "" : window.location.href;

    try {
      const file = await canvasToFile(canvas, "terra-nova-design.jpg");
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: t.designer.title });
        return;
      }
    } catch {
      // Cancelled, or the sheet refused the file — fall through to the link.
    }

    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${text}\n${pageUrl}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const downloadRender = async () => {
    const canvas = controller.canvasRef.current;
    if (!canvas) return;
    const file = await canvasToFile(canvas, "terra-nova-design.jpg");
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  /* -------------------------------- render ------------------------------- */

  const warnings = (controller.analysis?.warnings ?? []).filter(
    (warning) => warningCopy[warning],
  );

  return (
    <div
      className="flex min-h-dvh flex-col bg-studio text-studio-ink"
      data-designer-root
      // Lets a deep link, an analytics hook or a test name the open design
      // without exposing anything the visitor does not already own.
      data-design-id={controller.designId ?? undefined}
    >
      <header className="flex items-center justify-between gap-3 border-b border-studio-line px-4 py-3">
        <Link
          href={routes.home}
          aria-label={t.common.close}
          className="rounded-sm p-2 text-studio-ink/70 transition-colors hover:bg-white/10 hover:text-studio-ink"
        >
          <X className="size-5" />
        </Link>
        <div className="flex items-center gap-3">
          <BrandMark href={null} size="sm" className="hidden text-studio-ink sm:flex" />
          <span className="text-sm text-studio-ink/80">{t.designer.title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {controller.step === "design" ? (
            <Button size="sm" variant="studioOutline" onClick={controller.reset}>
              <RefreshCw />
              <span className="hidden sm:inline">{t.designer.replacePhoto}</span>
            </Button>
          ) : (
            <span className="w-10" />
          )}
        </div>
      </header>

      {controller.step === "upload" ? (
        <div className="flex flex-1 items-center justify-center">
          <UploadPanel onImage={controller.loadImage} error={controller.error} />
        </div>
      ) : null}

      {controller.step === "analyzing" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <Spinner className="text-[1.75rem] text-studio-ink/70" labelled={false} />
          <p className="font-display text-xl">
            {savedDesign ? t.common.loading : t.designer.analyzing}
          </p>
          <p className="text-sm text-studio-ink/55">
            {savedDesign ? savedDesign.name : t.designer.analyzingHint}
          </p>
        </div>
      ) : null}

      {controller.step === "design" ? (
        <div className="flex flex-1 flex-col pb-28 lg:grid lg:grid-cols-[1fr_23rem] lg:gap-6 lg:px-6 lg:py-6 lg:pb-28">
          {/* ------------------------------ stage ----------------------------- */}
          <div className="px-4 pt-4 lg:px-0 lg:pt-0">
            <CanvasStage
              controller={controller}
              compare={compare}
              onCompareChange={setCompare}
              overlay={
                <SceneOverlay
                  controller={scene}
                  surface={activeSurfaceMask}
                  floor={floorMask}
                  frame={frame}
                  drawingShape={drawingShape}
                  onFinishDrawing={() => setDrawingShape(null)}
                />
              }
              actions={
                <>
                  <Button
                    size="sm"
                    variant="studioOutline"
                    data-testid="scene-undo"
                    disabled={!scene.canUndo}
                    onClick={() => scene.dispatch({ type: "UNDO" })}
                  >
                    <Undo2 />
                    {t.designer.maskUndo}
                  </Button>
                  <Button
                    size="sm"
                    variant="studioOutline"
                    data-testid="scene-redo"
                    disabled={!scene.canRedo}
                    onClick={() => scene.dispatch({ type: "REDO" })}
                    aria-label="ביצוע מחדש"
                  >
                    <Redo2 />
                  </Button>
                </>
              }
            />

            {controller.error === "PROVIDER_FAILED" ? (
              <Notice
                tone="warning"
                title={t.states.aiFailedTitle}
                body={t.states.aiFailedBody}
              />
            ) : null}

            {warnings.map((warning) => (
              <Notice
                key={warning}
                tone="warning"
                title={warningCopy[warning]!.title}
                body={warningCopy[warning]!.body}
              />
            ))}
          </div>

          {/* ------------------------------ panel ----------------------------- */}
          <aside className="mt-4 flex flex-col border-t border-studio-line bg-studio-2 px-4 pb-32 pt-4 lg:mt-0 lg:rounded-lg lg:border lg:pb-4">
            {/* surface switch */}
            <div className="flex gap-1.5">
              {(["FLOOR", "WALL"] as const).map((kind) => {
                const available = controller.surfaces.some(
                  (surface) => surface.mask.kind === kind,
                );
                const active = controller.activeKind === kind;
                return (
                  <Button
                    key={kind}
                    variant={active ? "studio" : "studioOutline"}
                    aria-pressed={active}
                    data-testid={`surface-${kind.toLowerCase()}`}
                    onClick={() => controller.setActiveKind(kind)}
                    className="flex-1"
                  >
                    {kind === "FLOOR" ? t.designer.surfaceFloor : t.designer.surfaceWall}
                    {!available ? (
                      <span className="text-[0.625rem] opacity-60">
                        (סימון ידני)
                      </span>
                    ) : null}
                  </Button>
                );
              })}
            </div>

            {/* wall picker */}
            {controller.activeKind === "WALL" && wallSurfaces.length > 1 ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-studio-ink/60">{t.designer.walls}</p>
                <div className="flex flex-wrap gap-1.5">
                  {wallSurfaces.map((surface) => (
                    <Button
                      key={surface.mask.id}
                      size="sm"
                      variant="studioOutline"
                      aria-pressed={controller.activeSurfaceId === surface.mask.id}
                      onClick={() => controller.setActiveSurface(surface.mask.id)}
                      className={cn(
                        "rounded-xs px-2.5 text-xs",
                        controller.activeSurfaceId === surface.mask.id
                          ? "border-studio-ink text-studio-ink"
                          : "text-studio-ink/60",
                      )}
                    >
                      {surface.mask.label}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="studioOutline"
                    onClick={() => {
                      const productId = controller.activeSurface?.productId;
                      if (!productId) return;
                      controller.applyProduct(
                        productId,
                        wallSurfaces.map((surface) => surface.mask.id),
                      );
                    }}
                    disabled={!controller.activeSurface?.productId}
                    className="rounded-xs border-dashed px-2.5 text-xs text-studio-ink/60"
                  >
                    {t.designer.wallAll}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* panel switch */}
            <div
              className="scrollbar-none -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1"
              role="tablist"
              aria-label="כלי העיצוב"
            >
              {(
                [
                  { key: "cladding", label: t.designer.productDrawer },
                  { key: "objects", label: "הוספת פריטים" },
                  { key: "lighting", label: "תאורה" },
                  { key: "layers", label: "שכבות" },
                  { key: "controls", label: t.designer.controls },
                ] as const
              ).map((entry) => (
                <Button
                  key={entry.key}
                  size="sm"
                  role="tab"
                  variant="studioOutline"
                  aria-selected={panel === entry.key}
                  data-testid={`panel-${entry.key}`}
                  onClick={() => setPanel(entry.key)}
                  className={cn(
                    "shrink-0 text-xs",
                    panel === entry.key
                      ? "border-studio-ink text-studio-ink"
                      : "text-studio-ink/60",
                  )}
                >
                  {entry.label}
                </Button>
              ))}
            </div>

            <div className={cn("mt-4", panel === "cladding" ? "block" : "hidden")}>
              <ProductDrawer
                swatches={swatches}
                surfaceKind={controller.activeKind}
                selectedId={controller.activeSurface?.productId ?? null}
                onSelect={(productId) => controller.applyProduct(productId)}
              />
            </div>

            <div className={cn("mt-4 min-h-0 flex-1", panel === "objects" ? "block" : "hidden")}>
              <ObjectLibraryDrawer
                assets={objectAssets}
                onAdd={addObject}
                onUploadOwn={() => setCustomOpen(true)}
              />
            </div>

            <div className={cn("mt-4 min-h-0 flex-1", panel === "lighting" ? "block" : "hidden")}>
              <LightingDrawer
                controller={scene}
                drawingShape={drawingShape}
                onStartDrawing={setDrawingShape}
                onStopDrawing={() => setDrawingShape(null)}
                onAddFixture={addFixture}
              />
            </div>

            <div className={cn("mt-4 min-h-0 flex-1", panel === "layers" ? "block" : "hidden")}>
              <LayersPanel controller={scene} />
              <div className="mt-5 border-t border-studio-line pt-4">
                <h3 className="mb-2 text-[0.6875rem] tracking-[0.18em] text-studio-ink/50">
                  רשימת העיצוב
                </h3>
                <BillOfMaterials
                  claddings={controller.selectedProducts.map(({ surface, swatch }) => ({
                    swatch,
                    areaSqm: surface.areaSqm,
                  }))}
                  objects={scene.scene.objects}
                  totalAreaSqm={controller.estimate.areaSqm}
                  totalPrice={controller.estimate.price}
                />
              </div>
            </div>

            <div
              className={cn(
                "mt-4 border-t border-studio-line pt-5",
                panel === "controls" ? "block" : "hidden",
              )}
            >
              <ControlsPanel controller={controller} />
            </div>

          </aside>

          {/* ---------------------------- summary bar --------------------------- */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-studio-line bg-studio/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:px-8">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
              <dl className="flex gap-5">
                <div>
                  <dt className="text-[0.6875rem] text-studio-ink/50">
                    {t.designer.estimatedArea}
                  </dt>
                  <dd className="num text-sm text-studio-ink">
                    {formatArea(controller.estimate.areaSqm)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6875rem] text-studio-ink/50">
                    {t.designer.estimatedPrice}
                  </dt>
                  <dd className="num text-sm text-studio-ink">
                    {formatPrice(controller.estimate.price)}
                  </dd>
                </div>
              </dl>

              {/*
                Stated next to the price, not buried in a policy page: this is
                the moment someone decides to buy 40 m² from a picture.
              */}
              {hasSelection ? (
                <p className="w-full max-w-prose text-[0.6875rem] leading-relaxed text-studio-ink/55 lg:order-last">
                  {t.designer.renderDisclaimer}
                </p>
              ) : null}

              <div className="ms-auto flex flex-wrap items-center gap-2">
                {controller.selectedProducts.map(({ swatch }) => (
                  <Badge key={swatch.id} variant="neutral" className="hidden sm:flex">
                    {swatch.name}
                  </Badge>
                ))}
                <Button
                  size="sm"
                  variant="studioOutline"
                  onClick={downloadRender}
                  disabled={!hasSelection}
                  aria-label={t.designer.downloadImage}
                >
                  <Download />
                </Button>
                <Button
                  size="sm"
                  variant="studioOutline"
                  onClick={shareRender}
                  disabled={!hasSelection}
                  aria-label={t.designer.shareCta}
                >
                  <Share2 />
                </Button>
                <Button
                  size="sm"
                  variant="studioOutline"
                  data-testid="save-design"
                  onClick={() => setSaveOpen(true)}
                  disabled={!hasSelection}
                >
                  <Heart />
                  <span className="hidden sm:inline">{t.designer.likeCta}</span>
                </Button>
                <Button
                  size="sm"
                  variant="studio"
                  onClick={addSelectionToCart}
                  disabled={!hasSelection}
                >
                  <ShoppingBag />
                  {t.designer.addToCart}
                </Button>
                <Button asChild size="sm" variant="studioOutline">
                  <Link
                    href={
                      controller.designId
                        ? `${routes.quote}?design=${controller.designId}`
                        : `${routes.quote}?sqm=${controller.estimate.areaSqm}`
                    }
                  >
                    {t.designer.getQuote}
                  </Link>
                </Button>
              </div>
            </div>
            <p className="mx-auto mt-2 max-w-6xl text-[0.6875rem] text-studio-ink/40">
              {t.designer.areaEditHint} · {t.designer.compareHint}
            </p>
          </div>
        </div>
      ) : null}

      <CustomObjectDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        onReady={addCustomObject}
      />

      <SaveDesignDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        defaultName={controller.designName || t.designer.designNamePlaceholder}
        onSave={saveDesign}
        signedIn={Boolean(user)}
        pending={saving}
      />
    </div>
  );
}

function Notice({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "warning" | "info";
}) {
  return (
    <div
      className={cn(
        "mt-3 flex items-start gap-3 rounded-sm border p-3.5",
        tone === "warning"
          ? "border-[#6b5326] bg-[#231d12]"
          : "border-studio-line bg-studio-2",
      )}
    >
      {tone === "warning" ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#e0b062]" />
      ) : (
        <ImageIcon className="mt-0.5 size-4 shrink-0 text-studio-ink/60" />
      )}
      <div>
        <p className="text-sm text-studio-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-studio-ink/60">{body}</p>
      </div>
    </div>
  );
}
