import { Button, Empty } from "@/components";
import { PageLayout } from "@/layouts";
import { MapIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <PageLayout title="Page not found" description="This Dashboard address does not exist">
      <Empty
        isLoading={false}
        icon={MapIcon}
        title="Page not found"
        description="Return to session readiness and choose a section from the sidebar."
      />
      <Button className="self-center" onClick={() => navigate("/dashboard")}>
        Return to Dashboard
      </Button>
    </PageLayout>
  );
};

export default NotFound;
