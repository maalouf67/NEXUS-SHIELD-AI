# NEXUS SHIELD AI — reproducible threat analytics primitives.
# This module is an offline analysis/validation layer; it does not ingest live
# telemetry, call external providers, or make autonomous response decisions.

severity_weight <- function(severity) {
  weights <- c(informational = 0, low = 10, medium = 25, high = 45, critical = 60)
  value <- unname(weights[as.character(severity)])
  value[is.na(value)] <- 0
  value
}

robust_z_score <- function(x) {
  x <- as.numeric(x)
  center <- stats::median(x, na.rm = TRUE)
  scale <- stats::mad(x, center = center, constant = 1.4826, na.rm = TRUE)
  if (!is.finite(scale) || scale <= 0) {
    return(rep(0, length(x)))
  }
  (x - center) / scale
}

score_threat_events <- function(events, velocity_window_hours = 24) {
  required <- c("event_type", "severity", "observed_at")
  missing <- setdiff(required, names(events))
  if (length(missing)) {
    stop(sprintf("Missing required columns: %s", paste(missing, collapse = ", ")))
  }
  if (!is.numeric(velocity_window_hours) || length(velocity_window_hours) != 1L ||
      !is.finite(velocity_window_hours) || velocity_window_hours <= 0) {
    stop("velocity_window_hours must be one positive finite number")
  }

  observed <- as.POSIXct(events$observed_at, tz = "UTC")
  if (anyNA(observed)) stop("observed_at contains invalid timestamps")

  base <- severity_weight(events$severity)
  observed_seconds <- as.numeric(observed)
  window_seconds <- velocity_window_hours * 3600
  velocity_counts <- vapply(seq_along(observed_seconds), function(i) {
    sum(observed_seconds >= observed_seconds[i] - window_seconds &
        observed_seconds <= observed_seconds[i])
  }, integer(1))
  velocity <- pmin(20, pmax(0, (velocity_counts - 1) * 2))
  risk <- pmin(100, pmax(0, base + velocity))

  data.frame(
    risk_score = round(risk, 2),
    anomaly_z = round(robust_z_score(velocity_counts), 4),
    model_version = "nexus-r-baseline-0.1.0",
    stringsAsFactors = FALSE
  )
}
