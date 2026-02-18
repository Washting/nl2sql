import logging

logger = logging.getLogger(__name__)


class MLflowDebugger:
    """Wraps optional MLflow logging so query flow never breaks on tracing failures."""

    def __init__(self) -> None:
        self.enabled = False
        self._mlflow = None
        self._tracking_uri = ""
        self._experiment_name = ""
        self._run_name_prefix = "llm-debug"

    def configure(
        self,
        enabled: bool,
        tracking_uri: str,
        experiment_name: str,
        run_name_prefix: str = "llm-debug",
    ) -> bool:
        if not enabled:
            self.enabled = False
            return False

        try:
            import mlflow  # type: ignore

            self._tracking_uri = tracking_uri
            self._experiment_name = experiment_name
            self._run_name_prefix = run_name_prefix
            mlflow.set_tracking_uri(tracking_uri)
            mlflow.set_experiment(experiment_name)
            mlflow.langchain.autolog()  # type: ignore
            self.enabled = True
            logger.info(
                "MLflow debugger enabled. tracking_uri=%s, experiment=%s",
                tracking_uri,
                experiment_name,
            )
            return True
        except ImportError:
            logger.warning(
                "MLflow is enabled but not installed. Please install mlflow first."
            )
            self.enabled = False
            return False


mlflow_debugger = MLflowDebugger()
