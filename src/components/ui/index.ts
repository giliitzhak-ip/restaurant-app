/**
 * The design system.
 *
 * One entry point, so that "what does this interface have?" is a question the
 * codebase answers rather than something you find out by grepping for a class
 * string. Deep imports still work and are used throughout; this is the index,
 * not a gate.
 *
 * Reading order, roughly by how often a screen needs them:
 *
 *   Action     Button · IconButton · QuantityStepper
 *   Surface    Card · Separator · Skeleton · EmptyState · SectionHeading
 *   Form       Field · Label · FormMessage · Input · Textarea ·
 *              NativeSelect · Select · Checkbox · RadioGroup · Switch · Slider
 *   Feedback   ToastProvider · useToast · Spinner · Steps · Badge · Rating
 *   Overlay    Dialog · Sheet · Popover · DropdownMenu · Tooltip
 *   Structure  Tabs · Accordion
 *
 * The motion these share does not live here — it is five utilities in
 * globals.css (`interactive`, `press`, `tap-target`, `enter-item`,
 * `enter-soft`) plus the `card` surface, because a transition that belongs to
 * every component belongs to the stylesheet rather than to one of them.
 */

export { Button, buttonVariants, type ButtonProps } from "./button";
export { IconButton } from "./icon-button";
export { QuantityStepper } from "./quantity-stepper";
export { useTransientFlag } from "./use-transient-flag";

export { Card, CardHeader, CardTitle, CardBody, CardFooter } from "./card";
export { Separator } from "./separator";
export { Skeleton } from "./skeleton";
export { EmptyState } from "./empty-state";
export { SectionHeading } from "./section-heading";

export { Field, Label, FormMessage } from "./label";
export { Input, Textarea, fieldBase } from "./input";
export { NativeSelect } from "./native-select";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
export { Checkbox } from "./checkbox";
export { RadioCard, RadioGroup, RadioGroupItem } from "./radio-group";
export { Switch } from "./switch";
export { Slider } from "./slider";

export { ToastProvider, useToast } from "./toast";
export { Spinner } from "./spinner";
export { Steps, type Step, type StepState } from "./steps";
export { Badge, badgeVariants } from "./badge";
export { Rating } from "./rating";

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";
export { Popover, PopoverContent, PopoverTrigger } from "./popover";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

export { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./accordion";
