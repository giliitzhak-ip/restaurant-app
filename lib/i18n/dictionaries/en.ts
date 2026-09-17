import type { DeepPartial } from '../types';
import type { Dictionary } from './he';

/**
 * Partial locale: anything missing falls back to Hebrew at lookup time, so a
 * half-translated locale never renders an empty string.
 */
export const en: DeepPartial<Dictionary> = {
  brand: { tagline: 'The right pro. Exactly when you need one.' },
  common: {
    continue: 'Continue',
    back: 'Back',
    next: 'Next',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    saving: 'Saving…',
    send: 'Send',
    close: 'Close',
    edit: 'Edit',
    delete: 'Delete',
    search: 'Search',
    filter: 'Filter',
    sort: 'Sort',
    all: 'All',
    loading: 'Loading…',
    retry: 'Try again',
    optional: 'optional',
    required: 'Required',
    step: 'Step',
    of: 'of',
    login: 'Log in',
    signup: 'Sign up',
    logout: 'Log out',
    submit: 'Submit',
  },
  errors: {
    generic: 'Something went wrong. Please try again.',
    network: 'Connection problem. Check your network and retry.',
    unauthorized: 'You are not allowed to do that.',
    notFound: 'We could not find what you were looking for.',
    validation: 'Some fields need fixing.',
    rateLimited: 'Too many requests. Try again in a moment.',
    demoMode: 'Running in demo mode — no database connection configured.',
  },
  empty: {
    noProviders: 'No available professionals in your area yet.',
    noOffers: 'No offers yet.',
    noJobs: 'No jobs here yet.',
    noMessages: 'No messages yet.',
    noFavorites: 'You have not saved any professionals yet.',
    noReviews: 'No reviews yet.',
    noResults: 'No results found.',
  },
  nav: {
    home: 'Home',
    jobs: 'Jobs',
    messages: 'Messages',
    favorites: 'Favorites',
    profile: 'Profile',
    earnings: 'Earnings',
    admin: 'Admin',
  },
  landing: {
    heroTitle: 'The right pro.',
    heroTitleSecond: 'Exactly when you need one.',
    ctaCustomer: 'I need a professional',
    ctaProvider: 'I am a professional',
    howItWorks: 'How it works',
  },
  auth: {
    loginTitle: 'Log in',
    signupTitle: 'Sign up',
    email: 'Email',
    phone: 'Phone',
    password: 'Password',
    fullName: 'Full name',
  },
};
