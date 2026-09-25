import { Button, FieldLabel, Input, Textarea } from "@clipiro/ui";

// FieldLabel is the small uppercase label above a form control. Point htmlFor
// at the control's id so clicking the label focuses it.
export const Form = () => (
  <form className="max-w-md space-y-4" onSubmit={(e) => e.preventDefault()}>
    <div>
      <FieldLabel htmlFor="title">Clip title</FieldLabel>
      <Input id="title" defaultValue="Why most creators burn out" />
    </div>
    <div>
      <FieldLabel htmlFor="caption">Caption</FieldLabel>
      <Textarea id="caption" rows={3} defaultValue="The 3 habits that kept me posting daily for a year. #creator #shorts" />
    </div>
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" size="sm">Cancel</Button>
      <Button type="submit" size="sm">Save clip</Button>
    </div>
  </form>
);
