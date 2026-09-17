'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import type { CategoryRow, JobUrgency, ServiceRow } from '@/types/database';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { CategoryIcon } from '@/components/ui/category-icon';
import { MediaUpload } from '@/components/ui/media-upload';
import { Badge } from '@/components/ui/badge';
import { LocationStep, type LocationValue } from './location-step';
import { postJson } from '@/features/auth/lib/form';
import { createJobSchema } from '@/lib/validation/jobs';
import { fieldErrorsOf } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';
import { formatPrice } from '@/lib/utils/format';
import type { UploadedFile } from '@/lib/upload-client';

type StepId =
  | 'category'
  | 'service'
  | 'description'
  | 'photos'
  | 'video'
  | 'location'
  | 'urgency'
  | 'budget'
  | 'review';

interface Props {
  categories: CategoryRow[];
  services: ServiceRow[];
  defaultAddress?: string | null;
  defaultLat?: number | null;
  defaultLng?: number | null;
}

interface Classification {
  categoryId: string | null;
  categoryName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  urgency: JobUrgency;
  confidence: number;
}

const STEP_ORDER: StepId[] = [
  'category',
  'service',
  'description',
  'photos',
  'video',
  'location',
  'urgency',
  'budget',
  'review',
];

/**
 * The nine-step service request wizard.
 *
 * State lives in one object and only the final step posts to /api/jobs — media
 * is uploaded as it is chosen, so the submit carries paths rather than bytes.
 */
export function JobWizard({ categories, services, defaultAddress, defaultLat, defaultLng }: Props) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();

  const initialCategory = categories.find((entry) => entry.slug === params.get('category')) ?? null;
  const initialService =
    services.find(
      (entry) => entry.slug === params.get('service') && entry.category_id === initialCategory?.id,
    ) ?? null;

  const [stepIndex, setStepIndex] = useState(initialCategory ? 1 : 0);
  const [categoryId, setCategoryId] = useState<string | null>(initialCategory?.id ?? null);
  const [serviceId, setServiceId] = useState<string | null>(initialService?.id ?? null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [videos, setVideos] = useState<UploadedFile[]>([]);
  const [location, setLocation] = useState<LocationValue>({
    address: defaultAddress ?? '',
    addressNotes: '',
    coords: defaultLat != null && defaultLng != null ? { lat: defaultLat, lng: defaultLng } : null,
  });
  const [urgency, setUrgency] = useState<JobUrgency>('today');
  const [scheduledFor, setScheduledFor] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');

  const [classification, setClassification] = useState<Classification | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const step = STEP_ORDER[stepIndex];
  const category = categories.find((entry) => entry.id === categoryId) ?? null;
  const categoryServices = useMemo(
    () => services.filter((entry) => entry.category_id === categoryId),
    [services, categoryId],
  );
  const service = categoryServices.find((entry) => entry.id === serviceId) ?? null;

  /** Ask the classifier for a suggestion; it never overrides a user choice. */
  async function classify(text: string) {
    if (text.trim().length < 6) return;
    setClassifying(true);
    try {
      const result = await postJson<Classification>('/api/ai/classify', { text });
      setClassification(result);
      if (!categoryId && result.categoryId) setCategoryId(result.categoryId);
      if (!serviceId && result.serviceId) setServiceId(result.serviceId);
    } catch {
      // A failed suggestion is not an error the customer needs to see.
    } finally {
      setClassifying(false);
    }
  }

  function canAdvance(): boolean {
    switch (step) {
      case 'category':
        return Boolean(categoryId);
      case 'description':
        return title.trim().length >= 4 && description.trim().length >= 10;
      case 'location':
        return Boolean(location.coords) && location.address.trim().length >= 4;
      case 'urgency':
        return urgency !== 'scheduled' || Boolean(scheduledFor);
      default:
        return true;
    }
  }

  function next() {
    if (!canAdvance()) {
      setErrors({ step: 'יש להשלים את השדות בשלב הזה' });
      return;
    }
    setErrors({});
    setStepIndex((index) => Math.min(STEP_ORDER.length - 1, index + 1));
  }

  function back() {
    setErrors({});
    setStepIndex((index) => Math.max(0, index - 1));
  }

  async function submit() {
    setFormError(null);

    const payload = {
      categoryId,
      serviceId: serviceId ?? null,
      title: title.trim(),
      description: description.trim(),
      urgency,
      scheduledFor: urgency === 'scheduled' && scheduledFor ? new Date(scheduledFor).toISOString() : null,
      address: location.address.trim(),
      addressNotes: location.addressNotes.trim() || null,
      lat: location.coords?.lat,
      lng: location.coords?.lng,
      budgetMin: budgetMin ? Number(budgetMin) : null,
      budgetMax: budgetMax ? Number(budgetMax) : null,
      media: [
        ...photos.map((file) => ({ storagePath: file.path, kind: 'image' as const })),
        ...videos.map((file) => ({ storagePath: file.path, kind: 'video' as const })),
      ],
    };

    const parsed = createJobSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      setFormError(t.errors.validation);
      return;
    }

    setSubmitting(true);
    try {
      const result = await postJson<{ job: { id: string } }>('/api/jobs', parsed.data);
      router.replace(`/app/jobs/${result.job.id}`);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t.errors.generic);
      setSubmitting(false);
    }
  }

  const stepLabels: Record<StepId, string> = {
    category: t.wizard.stepCategory,
    service: t.wizard.stepService,
    description: t.wizard.stepDescription,
    photos: t.wizard.stepPhotos,
    video: t.wizard.stepVideo,
    location: t.wizard.stepLocation,
    urgency: t.wizard.stepUrgency,
    budget: t.wizard.stepBudget,
    review: t.wizard.stepReview,
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{stepLabels[step]}</span>
          <span className="num text-muted-foreground">
            {t.common.step} {stepIndex + 1} {t.common.of} {STEP_ORDER.length}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={STEP_ORDER.length}
          aria-label={t.wizard.title}
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${((stepIndex + 1) / STEP_ORDER.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        {step === 'category' ? (
          <fieldset>
            <legend className="mb-3 font-semibold">{t.wizard.categoryPrompt}</legend>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {categories.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={categoryId === entry.id}
                    onClick={() => {
                      setCategoryId(entry.id);
                      setServiceId(null);
                    }}
                    className={cn(
                      'flex h-full w-full flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors',
                      categoryId === entry.id
                        ? 'border-accent bg-accent/5 text-accent'
                        : 'hover:bg-secondary',
                    )}
                  >
                    <CategoryIcon name={entry.icon} />
                    <span className="text-xs font-medium leading-tight">{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}

        {step === 'service' ? (
          <fieldset>
            <legend className="mb-3 font-semibold">{t.wizard.servicePrompt}</legend>
            <ul className="space-y-2">
              {categoryServices.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={serviceId === entry.id}
                    onClick={() => setServiceId(entry.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border p-3 text-start text-sm transition-colors',
                      serviceId === entry.id ? 'border-accent bg-accent/5 text-accent' : 'hover:bg-secondary',
                    )}
                  >
                    {entry.name}
                    {serviceId === entry.id ? <Check className="size-4" aria-hidden /> : null}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  role="radio"
                  aria-checked={serviceId === null}
                  onClick={() => setServiceId(null)}
                  className={cn(
                    'w-full rounded-lg border border-dashed p-3 text-start text-sm transition-colors',
                    serviceId === null ? 'border-accent text-accent' : 'hover:bg-secondary',
                  )}
                >
                  {t.wizard.serviceOther}
                </button>
              </li>
            </ul>
          </fieldset>
        ) : null}

        {step === 'description' ? (
          <div className="space-y-4">
            <p className="font-semibold">{t.wizard.descriptionPrompt}</p>
            <Field label={t.wizard.titleLabel} htmlFor="title" error={errors.title} required>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t.wizard.titlePlaceholder}
                maxLength={120}
              />
            </Field>
            <Field
              label={t.wizard.descriptionLabel}
              htmlFor="description"
              error={errors.description}
              required
            >
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onBlur={() => classify(`${title} ${description}`)}
                placeholder={t.wizard.descriptionPlaceholder}
                rows={6}
                maxLength={4000}
              />
            </Field>

            {classification?.categoryName && classification.confidence >= 0.5 ? (
              <p className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/5 p-3 text-sm">
                <Sparkles className="size-4 text-accent" aria-hidden />
                <span className="font-medium">{t.wizard.aiSuggestion}:</span>
                <Badge variant="accent">{classification.categoryName}</Badge>
                {classification.serviceName ? (
                  <Badge variant="secondary">{classification.serviceName}</Badge>
                ) : null}
              </p>
            ) : null}
            {classifying ? <p className="text-xs text-muted-foreground">{t.common.loading}</p> : null}
          </div>
        ) : null}

        {step === 'photos' ? (
          <MediaUpload
            bucket="job-media"
            value={photos}
            onChange={setPhotos}
            accept="image/png,image/jpeg,image/webp"
            max={8}
            label={t.wizard.photosPrompt}
            hint="PNG / JPG / WEBP, עד 50MB לקובץ"
          />
        ) : null}

        {step === 'video' ? (
          <MediaUpload
            bucket="job-media"
            value={videos}
            onChange={setVideos}
            accept="video/mp4,video/quicktime"
            max={1}
            kind="video"
            label={t.wizard.videoPrompt}
            hint={t.common.optional}
          />
        ) : null}

        {step === 'location' ? (
          <LocationStep value={location} onChange={setLocation} error={errors.address} />
        ) : null}

        {step === 'urgency' ? (
          <fieldset className="space-y-4">
            <legend className="mb-1 font-semibold">{t.wizard.urgencyPrompt}</legend>
            <ul className="grid grid-cols-2 gap-2">
              {(
                [
                  ['now', t.wizard.urgencyNow],
                  ['today', t.wizard.urgencyToday],
                  ['tomorrow', t.wizard.urgencyTomorrow],
                  ['scheduled', t.wizard.urgencyScheduled],
                ] as Array<[JobUrgency, string]>
              ).map(([value, label]) => (
                <li key={value}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={urgency === value}
                    onClick={() => setUrgency(value)}
                    className={cn(
                      'w-full rounded-xl border p-4 text-sm font-medium transition-colors',
                      urgency === value ? 'border-accent bg-accent/5 text-accent' : 'hover:bg-secondary',
                    )}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
            {urgency === 'scheduled' ? (
              <Field label={t.wizard.scheduledFor} htmlFor="scheduledFor" error={errors.scheduledFor} required>
                <Input
                  id="scheduledFor"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                />
              </Field>
            ) : null}
          </fieldset>
        ) : null}

        {step === 'budget' ? (
          <div className="space-y-4">
            <div>
              <p className="font-semibold">{t.wizard.budgetPrompt}</p>
              <p className="text-sm text-muted-foreground">{t.wizard.budgetHint}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.wizard.budgetFrom} htmlFor="budgetMin">
                <Input
                  id="budgetMin"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={budgetMin}
                  onChange={(event) => setBudgetMin(event.target.value)}
                  dir="ltr"
                />
              </Field>
              <Field label={t.wizard.budgetTo} htmlFor="budgetMax" error={errors.budgetMax}>
                <Input
                  id="budgetMax"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={budgetMax}
                  onChange={(event) => setBudgetMax(event.target.value)}
                  dir="ltr"
                />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="space-y-4">
            <p className="font-semibold">{t.wizard.reviewPrompt}</p>
            <dl className="divide-y rounded-xl border text-sm">
              {[
                [t.job.category, category?.name ?? '—'],
                [t.job.service, service?.name ?? t.wizard.serviceOther],
                [t.wizard.titleLabel, title || '—'],
                [t.job.description, description || '—'],
                [t.job.address, location.address || '—'],
                [t.job.urgency, t.job.urgencyLabel[urgency]],
                [
                  t.job.budget,
                  budgetMin || budgetMax
                    ? [budgetMin && formatPrice(Number(budgetMin)), budgetMax && formatPrice(Number(budgetMax))]
                        .filter(Boolean)
                        .join(' – ')
                    : t.common.optional,
                ],
                [t.job.photos, String(photos.length + videos.length)],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-4 p-3">
                  <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 flex-1 break-words font-medium">{value}</dd>
                </div>
              ))}
            </dl>

            {formError ? (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {formError}
              </p>
            ) : null}
          </div>
        ) : null}

        {errors.step ? (
          <p role="alert" className="mt-4 text-sm font-medium text-destructive">
            {errors.step}
          </p>
        ) : null}
      </div>

      <div className="flex gap-2">
        {stepIndex > 0 ? (
          <Button type="button" variant="outline" onClick={back} className="flex-1">
            <ArrowRight aria-hidden />
            {t.common.back}
          </Button>
        ) : null}

        {step === 'review' ? (
          <Button type="button" variant="success" onClick={submit} loading={submitting} className="flex-[2]">
            {submitting ? t.wizard.submitting : t.wizard.submitRequest}
          </Button>
        ) : (
          <Button type="button" onClick={next} className="flex-[2]">
            {t.common.next}
            <ArrowLeft aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
