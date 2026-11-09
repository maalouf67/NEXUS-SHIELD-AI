source(file.path("services", "analytics-r", "R", "threat_analytics.R"))

stopifnot(identical(severity_weight(c("low", "medium", "high", "critical")), c(10, 25, 45, 60)))
stopifnot(all(robust_z_score(c(1, 1, 1)) == 0))
outlier_z <- robust_z_score(c(1, 2, 3, 100))
stopifnot(all(is.finite(outlier_z)))
stopifnot(outlier_z[4] > 0)

sample_events <- data.frame(
  event_type = c("login_failure", "login_failure", "malware"),
  severity = c("low", "high", "critical"),
  observed_at = c("2026-11-09T10:00:00Z", "2026-11-09T10:15:00Z", "2026-11-09T11:00:00Z")
)
scored <- score_threat_events(sample_events)
stopifnot(nrow(scored) == 3L)
stopifnot(all(scored$risk_score >= 0 & scored$risk_score <= 100))
stopifnot(all(nzchar(scored$model_version)))
print(scored)
stopifnot(identical(as.integer(scored$event_velocity_24h), c(1L, 2L, 1L)))
stopifnot(identical(as.numeric(scored$risk_score), c(10, 47, 60)))
stopifnot(all(is.finite(scored$anomaly_z)))
