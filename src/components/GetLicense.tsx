// Compatibility for dormant upgrade branches in the upstream UI.
// Local features are always enabled; no remote entitlement is provided.
export const GetLicense = (_props: {
  setState?: React.Dispatch<React.SetStateAction<boolean>>;
  buttonText?: string;
  buttonClassName?: string;
}) => null;
