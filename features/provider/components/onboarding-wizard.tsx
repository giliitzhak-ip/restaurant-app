'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Trash2 } from 'lucide-react';
import type { CategoryRow, DocumentType, ServiceRow } from '@/types/database';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { CategoryIcon } from '@/components/ui/category-icon';
import { MediaUpload } from '@/components/ui/media-upload';
import { SuccessState } from '@/components/ui/states';
import { LocationStep, type LocationValue } from '@/features/jobs/components/location-step';
import { patchJson, postJson } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';
import type { UploadedFile } from '@/lib/upload-client';

type StepId =
  | 'personal'
  | 'business'
  | 'categories'
  | 'areas'
  | 'pricing'
  | 'documents'
  | 'gallery'
  | 'terms';

const STEPS: StepId[] = [
  'personal',
  'business',
  'categories',
  'areas',
  'pricing',
  'documents',
  'gallery',
  'terms',
];

const DOC_TYPES: DocumentType[] = [
  'identity',
  'professional_license',
  'certificate',
  'insurance',
  'business_registration',
  'other',
];

interface ServiceArea {
  label: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

interface Props {
  categories: CategoryRow[];
  services: ServiceRow[];
  initial: {
    businessName: string;
    ownerName: string;
    phone: string;
    bio: string;
    yearsExperience: number;
    basePrice: number | null;
    categoryIds: string[];
    serviceIds: string[];
    serviceAreas: ServiceArea[];
    documentCount: number;
    onboardingCompleted: boolean;
  };
}

/**
 * Provider onboarding.
 *
 * Each step saves as the provider advances, so a dropped session does not lose
 * work. Submitting only marks the profile ready for review — verification
 * itself is an admin decision, never something this form can grant.
 */
export function ProviderOnboardingWizard({ categories, services, initial }: Props) {
  const t = useT();
  const router = useRouter();

  const [stepIndex, setStepIndex] = useState(0);
  const [businessName, setBusinessName] = useState(initial.businessName);
  const [ownerName, setOwnerName] = useState(initial.ownerName);
  const [phone, setPhone] = useState(initial.phone);
  const [bio, setBio] = useState(initial.bio);
  const [yearsExperience, setYearsExperience] = useState(String(initial.yearsExperience));
  const [basePrice, setBasePrice] = useState(initial.basePrice ? String(initial.basePrice) : '');
  const [categoryIds, setCategoryIds] = useState<string[]>(initial.categoryIds);
  const [serviceIds, setServiceIds] = useState<string[]>(initial.serviceIds);
  const [areas, setAreas] = useState<ServiceArea[]>(initial.serviceAreas);
  const [areaDraft, setAreaDraft] = useState<LocationValue>({ address: '', addressNotes: '', coords: null });
  const [areaRadius, setAreaRadius] = useState('15');
  const [documents, setDocuments] = useState<UploadedFile[]>([]);
  const [documentType, setDocumentType] = useState<DocumentType>('identity');
  const [documentCount, setDocumentCount] = useState(initial.documentCount);
  const [gallery, setGallery] = useState<UploadedFile[]>([]);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const step = STEPS[stepIndex];

  const categoryServices = useMemo(
    () => services.filter((service) => categoryIds.includes(service.category_id)),
    [services, categoryIds],
  );

  const labels: Record<StepId, string> = {
    personal: t.onboarding.stepPersonal,
    business: t.onboarding.stepBusiness,
    categories: t.onboarding.stepCategories,
    areas: t.onboarding.stepAreas,
    pricing: t.onboarding.stepPricing,
    documents: t.onboarding.stepDocuments,
    gallery: t.onboarding.stepGallery,
    terms: t.onboarding.stepTerms,
  };

  /** Persists whatever this step owns before moving on. */
  async function saveStep(): Promise<boolean> {
    setSaving(true);
    setError(null);

    try {
      switch (step) {
        case 'personal':
          await patchJson('/api/provider/profile', { ownerName, phone, onboardingStep: 1 });
          break;
        case 'business':
          await patchJson('/api/provider/profile', {
            businessName,
            bio: bio || null,
            yearsExperience: Number(yearsExperience) || 0,
            onboardingStep: 2,
          });
          break;
        case 'categories':
          await patchJson('/api/provider/profile', { categoryIds, serviceIds, onboardingStep: 3 });
          break;
        case 'areas':
          await patchJson('/api/provider/profile', { serviceAreas: areas, onboardingStep: 4 });
          break;
        case 'pricing':
          await patchJson('/api/provider/profile', {
            basePrice: basePrice ? Number(basePrice) : null,
            onboardingStep: 5,
          });
          break;
        case 'documents':
          for (const file of documents) {
            await postJson('/api/provider/documents', {
              docType: documentType,
              storagePath: file.path,
              fileName: file.name,
            });
            setDocumentCount((count) => count + 1);
          }
          setDocuments([]);
          break;
        case 'gallery':
          // Gallery images are public and already uploaded; nothing else to save.
          break;
        default:
          break;
      }
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t.errors.generic);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    if (!(await saveStep())) return;
    setStepIndex((index) => Math.min(STEPS.length - 1, index + 1));
  }

  async function submit() {
    if (!acceptTerms) {
      setError(t.onboarding.termsAccept);
      return;
    }
    if (!(await saveStep())) return;

    setSaving(true);
    setError(null);
    try {
      await postJson('/api/provider/onboarding', { acceptTerms: true });
      setSubmitted(true);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.errors.generic);
    } finally {
      setSaving(false);
    }
  }

  function addArea() {
    if (!areaDraft.coords || !areaDraft.address.trim()) {
      setError('בחר מיקום לאזור השירות');
      return;
    }
    setError(null);
    setAreas((current) => [
      ...current,
      {
        label: areaDraft.address.trim().slice(0, 80),
        centerLat: areaDraft.coords!.lat,
        centerLng: areaDraft.coords!.lng,
        radiusKm: Number(areaRadius) || 15,
      },
    ]);
    setAreaDraft({ address: '', addressNotes: '', coords: null });
  }

  if (submitted) {
    return (
      <SuccessState
        title={t.onboarding.submitted}
        description={t.provider.pendingVerificationBody}
        action={
          <Button asChild variant="accent">
            <Link href="/provider">{t.nav.dashboard}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{labels[step]}</span>
          <span className="num text-muted-foreground">
            {stepIndex + 1} / {STEPS.length}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label={t.onboarding.title}
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        {step === 'personal' ? (
          <div className="space-y-4">
            <Field label={t.onboarding.ownerName} htmlFor="ownerName" required>
              <Input id="ownerName" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </Field>
            <Field label={t.auth.phone} htmlFor="phone" required hint="לדוגמה 0501234567">
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" />
            </Field>
          </div>
        ) : null}

        {step === 'business' ? (
          <div className="space-y-4">
            <Field label={t.onboarding.businessName} htmlFor="businessName" required>
              <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </Field>
            <Field label={t.onboarding.yearsExperience} htmlFor="years">
              <Input
                id="years"
                type="number"
                min={0}
                max={70}
                dir="ltr"
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
              />
            </Field>
            <Field label={t.onboarding.bio} htmlFor="bio">
              <Textarea
                id="bio"
                rows={5}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t.onboarding.bioPlaceholder}
                maxLength={2000}
              />
            </Field>
          </div>
        ) : null}

        {step === 'categories' ? (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t.onboarding.pickCategories}</legend>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {categories.map((category) => {
                  const selected = categoryIds.includes(category.id);
                  return (
                    <li key={category.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        onClick={() =>
                          setCategoryIds((current) =>
                            selected
                              ? current.filter((id) => id !== category.id)
                              : [...current, category.id],
                          )
                        }
                        className={cn(
                          'flex h-full w-full flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors',
                          selected ? 'border-accent bg-accent/5 text-accent' : 'hover:bg-secondary',
                        )}
                      >
                        <CategoryIcon name={category.icon} />
                        <span className="text-xs font-medium leading-tight">{category.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            {categoryServices.length > 0 ? (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">{t.onboarding.pickServices}</legend>
                <ul className="flex flex-wrap gap-2">
                  {categoryServices.map((service) => {
                    const selected = serviceIds.includes(service.id);
                    return (
                      <li key={service.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          onClick={() =>
                            setServiceIds((current) =>
                              selected ? current.filter((id) => id !== service.id) : [...current, service.id],
                            )
                          }
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                            selected ? 'border-accent bg-accent/10 text-accent' : 'hover:bg-secondary',
                          )}
                        >
                          {selected ? <Check className="me-1 inline size-3" aria-hidden /> : null}
                          {service.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ) : null}
          </div>
        ) : null}

        {step === 'areas' ? (
          <div className="space-y-5">
            {areas.length > 0 ? (
              <ul className="space-y-2">
                {areas.map((area, index) => (
                  <li
                    key={`${area.label}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {area.label} · <span className="num">{area.radiusKm}</span> ק״מ
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`הסרת ${area.label}`}
                      onClick={() => setAreas((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="space-y-4 rounded-xl border border-dashed p-4">
              <p className="text-sm font-medium">{t.onboarding.addArea}</p>
              <LocationStep value={areaDraft} onChange={setAreaDraft} />
              <Field label={t.onboarding.areaRadius} htmlFor="radius">
                <Input
                  id="radius"
                  type="number"
                  min={1}
                  max={300}
                  dir="ltr"
                  value={areaRadius}
                  onChange={(e) => setAreaRadius(e.target.value)}
                />
              </Field>
              <Button type="button" variant="secondary" onClick={addArea} className="w-full">
                {t.onboarding.addArea}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'pricing' ? (
          <Field
            label={t.onboarding.basePrice}
            htmlFor="basePrice"
            hint="מחיר הקריאה המינימלי שלך — מוצג ללקוחות כ״החל מ־״"
          >
            <Input
              id="basePrice"
              type="number"
              min={0}
              dir="ltr"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
            />
          </Field>
        ) : null}

        {step === 'documents' ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
              {t.onboarding.documentsHint}
            </p>
            <Field label="סוג המסמך" htmlFor="docType">
              <Select
                id="docType"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              >
                {DOC_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t.onboarding.documentTypes[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <MediaUpload
              bucket="provider-documents"
              value={documents}
              onChange={setDocuments}
              accept="image/png,image/jpeg,image/webp,application/pdf"
              max={5}
              kind="document"
              label={t.onboarding.uploadDocument}
              hint="PDF / JPG / PNG, עד 20MB"
            />
            {documentCount > 0 ? (
              <p className="text-sm text-muted-foreground">
                נשמרו <span className="num">{documentCount}</span> מסמכים.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 'gallery' ? (
          <MediaUpload
            bucket="provider-gallery"
            value={gallery}
            onChange={setGallery}
            accept="image/png,image/jpeg,image/webp"
            max={8}
            label={t.onboarding.stepGallery}
            hint={t.common.optional}
          />
        ) : null}

        {step === 'terms' ? (
          <div className="space-y-4">
            <div className="max-h-48 overflow-y-auto rounded-lg border p-3 text-sm text-muted-foreground">
              <p>
                בהצטרפות כבעל מקצוע אתה מאשר את{' '}
                <Link href="/legal/provider-agreement" className="text-accent hover:underline">
                  {t.legal.providerAgreement}
                </Link>{' '}
                ואת{' '}
                <Link href="/legal/payment-terms" className="text-accent hover:underline">
                  {t.legal.paymentTerms}
                </Link>
                , לרבות עמלת הפלטפורמה שמנוכה מכל עסקה.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1 size-4 rounded border-input"
              />
              {t.onboarding.termsAccept}
            </label>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex gap-2">
        {stepIndex > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStepIndex((index) => index - 1)}
            className="flex-1"
          >
            <ArrowRight aria-hidden />
            {t.common.back}
          </Button>
        ) : null}

        {step === 'terms' ? (
          <Button type="button" variant="success" onClick={submit} loading={saving} className="flex-[2]">
            {t.onboarding.submitForReview}
          </Button>
        ) : (
          <Button type="button" onClick={next} loading={saving} className="flex-[2]">
            {t.common.next}
            <ArrowLeft aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
