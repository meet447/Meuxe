use std::time::Duration;

/// Retry a fallible async operation with exponential backoff.
///
/// - `max_retries`: number of retries after the first attempt (so total attempts = max_retries + 1)
/// - `base_delay_ms`: initial delay between retries, doubles each retry
/// - `should_retry`: predicate on the error to decide if retrying makes sense
///   (e.g., retry on 429/500/502/503, don't retry on 401/400)
pub async fn retry_with_backoff<F, Fut, T, E>(
    max_retries: usize,
    base_delay_ms: u64,
    should_retry: impl Fn(&E) -> bool,
    mut operation: F,
) -> std::result::Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = std::result::Result<T, E>>,
    E: std::fmt::Display,
{
    let mut last_err: Option<E> = None;

    for attempt in 0..=max_retries {
        match operation().await {
            Ok(val) => return Ok(val),
            Err(e) => {
                if attempt < max_retries && should_retry(&e) {
                    let delay = base_delay_ms * (1 << attempt); // exponential: 500, 1000, 2000...
                    eprintln!(
                        "[retry] attempt {}/{} failed: {} — retrying in {}ms",
                        attempt + 1,
                        max_retries + 1,
                        e,
                        delay
                    );
                    tokio::time::sleep(Duration::from_millis(delay)).await;
                    last_err = Some(e);
                } else {
                    return Err(e);
                }
            }
        }
    }

    Err(last_err.unwrap()) // unreachable in practice
}

/// Check if an HTTP/LLM error is retryable (transient server errors, rate limits).
pub fn is_retryable_llm_error(err: &crate::error::MeuxeError) -> bool {
    let msg = err.to_string();
    // Rate limit
    if msg.contains("429") || msg.contains("rate limit") || msg.contains("Rate limit") {
        return true;
    }
    // Server errors
    if msg.contains("500") || msg.contains("502") || msg.contains("503") || msg.contains("504") {
        return true;
    }
    // Network errors
    if msg.contains("connection") || msg.contains("timeout") || msg.contains("timed out") {
        return true;
    }
    // reqwest transport errors
    if matches!(err, crate::error::MeuxeError::Http(_)) {
        return true;
    }
    false
}

/// Check if a TTS error is retryable.
pub fn is_retryable_tts_error(err: &crate::error::MeuxeError) -> bool {
    // TTS errors from network are retryable, config errors are not
    let msg = err.to_string();
    if msg.contains("API key") || msg.contains("Unknown TTS provider") {
        return false;
    }
    is_retryable_llm_error(err)
}
