use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

// The command mutex owns this session until its native stream has been dropped.
// A finished handle can stay in the slot, but must never block the next start.
pub(crate) struct CaptureSession {
    task: JoinHandle<()>,
    active: Arc<AtomicBool>,
    manual_stop: Option<oneshot::Sender<()>>,
}

struct Completion<F: FnOnce()> {
    active: Arc<AtomicBool>,
    stopped: Option<F>,
}

impl<F: FnOnce()> Drop for Completion<F> {
    fn drop(&mut self) {
        self.active.store(false, Ordering::Release);
        if let Some(stopped) = self.stopped.take() {
            stopped();
        }
    }
}

impl CaptureSession {
    pub fn spawn<F, C>(capture: F, manual_stop: Option<oneshot::Sender<()>>, stopped: C) -> Self
    where
        F: Future<Output = ()> + Send + 'static,
        C: FnOnce() + Send + 'static,
    {
        let active = Arc::new(AtomicBool::new(true));
        let completion = Completion {
            active: active.clone(),
            stopped: Some(stopped),
        };
        let task = tokio::spawn(async move {
            // Created outside the future so cancellation before its first poll
            // also resets the state and notifies the UI.
            let _completion = completion;
            capture.await;
        });
        Self {
            task,
            active,
            manual_stop,
        }
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Acquire) && !self.task.is_finished()
    }

    pub fn request_send(&mut self) -> Result<(), String> {
        let sender = self
            .manual_stop
            .take()
            .ok_or("No manual recording is running")?;
        // A closed receiver means the recording has already reached its limit.
        let _ = sender.send(());
        Ok(())
    }

    pub async fn wait(self) {
        let _ = self.task.await;
    }

    pub async fn discard(self) {
        self.task.abort();
        let _ = self.task.await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Resource(Arc<AtomicBool>);
    impl Drop for Resource {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn discard_waits_for_resource_cleanup_even_before_first_poll() {
        let released = Arc::new(AtomicBool::new(false));
        let notified = Arc::new(AtomicBool::new(false));
        let resource = Resource(released.clone());
        let notification = notified.clone();
        let session = CaptureSession::spawn(
            async move {
                let _resource = resource;
                std::future::pending::<()>().await;
            },
            None,
            move || {
                notification.store(true, Ordering::SeqCst);
            },
        );
        session.discard().await;
        assert!(released.load(Ordering::SeqCst));
        assert!(notified.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn manual_send_finishes_and_releases_the_stream() {
        let (send, receive) = oneshot::channel();
        let released = Arc::new(AtomicBool::new(false));
        let resource = Resource(released.clone());
        let mut session = CaptureSession::spawn(
            async move {
                let _resource = resource;
                let _ = receive.await;
            },
            Some(send),
            || {},
        );
        assert!(session.is_active());
        session.request_send().unwrap();
        session.wait().await;
        assert!(released.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn natural_completion_is_not_reported_as_running() {
        let (notified, notification) = oneshot::channel();
        let session = CaptureSession::spawn(async {}, None, move || {
            let _ = notified.send(());
        });
        notification.await.unwrap();
        assert!(!session.is_active());
        session.wait().await;
    }
}
