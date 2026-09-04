import { Badge, Button, Empty, Input } from "@/components";
import { useHistory } from "@/hooks";
import { PageLayout } from "@/layouts";
import { MessageCircleIcon, SearchIcon, XIcon } from "lucide-react";
import moment from "moment";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const PAGE_SIZE = 50;

const Chats = () => {
  const conversations = useHistory();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const normalizedSearch = conversations.search.trim().toLocaleLowerCase();
  const filteredConversations = conversations.conversations.filter((conversation) =>
    conversation.title.toLocaleLowerCase().includes(normalizedSearch)
  );
  const visibleConversations = filteredConversations.slice(0, visibleCount);
  const groupedConversations = visibleConversations.reduce(
    (groups, conversation) => {
      const dateKey = moment(conversation.updatedAt).format("YYYY-MM-DD");
      groups[dateKey] ??= [];
      groups[dateKey].push(conversation);
      return groups;
    },
    {} as Record<string, typeof conversations.conversations>
  );
  const sortedDates = Object.keys(groupedConversations).sort((a, b) => moment(b).diff(moment(a)));

  useEffect(() => setVisibleCount(PAGE_SIZE), [normalizedSearch]);

  const openConversation = (id: string) => () => navigate(`/chats/view/${id}`);
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => conversations.setSearch(event.target.value);
  const clearSearch = () => {
    conversations.setSearch("");
    searchRef.current?.focus();
  };
  const loadMore = () => setVisibleCount((count) => count + PAGE_SIZE);

  return (
    <PageLayout title="Conversations" description="Review locally saved conversations">
      {conversations.conversations.length === 0 ? (
        <Empty
          isLoading={conversations.isLoading}
          icon={MessageCircleIcon}
          title="No conversations yet"
          description="Start a conversation from the compact Assistant"
        />
      ) : (
        <div className="flex flex-col gap-5 pb-8">
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                ref={searchRef}
                type="search"
                aria-label="Search conversations"
                placeholder="Search conversations"
                className="px-9 focus-visible:ring-2"
                value={conversations.search}
                onChange={handleSearchChange}
              />
              {conversations.search && (
                <Button type="button" size="icon" variant="ghost" className="absolute right-1 top-1/2 size-7 -translate-y-1/2" onClick={clearSearch} aria-label="Clear conversation search" title="Clear search">
                  <XIcon className="size-3.5" />
                </Button>
              )}
            </div>
            <p className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
              {filteredConversations.length} {filteredConversations.length === 1 ? "conversation" : "conversations"}
            </p>
          </div>

          {filteredConversations.length === 0 ? (
            <Empty isLoading={false} icon={SearchIcon} title="No matching conversations" description="Try a different title or clear the search" />
          ) : (
            <>
              {sortedDates.map((dateKey) => (
                <section key={dateKey} className="flex flex-col gap-3" aria-labelledby={`date-${dateKey}`}>
                  <h2 id={`date-${dateKey}`} className="text-xs font-medium text-muted-foreground">
                    {moment(dateKey).format("ddd, MMM D")}
                  </h2>
                  <div className="grid grid-cols-1 gap-3">
                    {groupedConversations[dateKey].map((conversation) => (
                      <button
                        type="button"
                        key={conversation.id}
                        className="flex w-full items-center justify-between gap-4 rounded-xl border bg-black/5 p-4 text-left transition-colors hover:border-primary/50 focus-visible:ring-4 focus-visible:ring-ring/60 dark:bg-white/5"
                        onClick={openConversation(conversation.id)}
                      >
                        <span className="line-clamp-1 min-w-0 flex-1 text-sm">{conversation.title}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Badge variant="outline" className="text-xs">{conversation.messages.length} messages</Badge>
                          <Badge variant="outline" className="text-xs">{moment(conversation.updatedAt).format("LT")}</Badge>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {visibleCount < filteredConversations.length && (
                <Button variant="outline" className="self-center" onClick={loadMore}>Load more conversations</Button>
              )}
            </>
          )}
        </div>
      )}
    </PageLayout>
  );
};

export default Chats;
