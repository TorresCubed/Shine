import { BackButton } from "../MenuItem";
import { CreditsList, LinksList } from "../Credits";

export const CreditsScreen = () => (
  <>
    <h2>Credits</h2>
    <CreditsList />
    <LinksList />
    <BackButton />
  </>
);
