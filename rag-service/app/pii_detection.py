"""PII detection and redaction using Presidio (if available)."""
from typing import List, Dict, Optional
import logging

try:
    from presidio_analyzer import AnalyzerEngine
    from presidio_anonymizer import AnonymizerEngine
    from presidio_anonymizer.entities import OperatorConfig
    PRESIDIO_AVAILABLE = True
except ImportError:
    AnalyzerEngine = None  # type: ignore
    AnonymizerEngine = None  # type: ignore
    OperatorConfig = None  # type: ignore
    PRESIDIO_AVAILABLE = False

from app.config import settings

logger = logging.getLogger(__name__)

# Lazy initialization of Presidio engines
_analyzer = None
_anonymizer = None


def _get_analyzer():
    """Lazy initialization of AnalyzerEngine."""
    global _analyzer
    if not PRESIDIO_AVAILABLE:
        return None
    if _analyzer is None:
        try:
            _analyzer = AnalyzerEngine()
        except Exception as e:
            logger.warning(f"Failed to initialize Presidio AnalyzerEngine: {e}. PII detection will be disabled.")
            _analyzer = None
    return _analyzer


def _get_anonymizer():
    """Lazy initialization of AnonymizerEngine."""
    global _anonymizer
    if not PRESIDIO_AVAILABLE:
        return None
    if _anonymizer is None:
        try:
            _anonymizer = AnonymizerEngine()
        except Exception as e:
            logger.warning(f"Failed to initialize Presidio AnonymizerEngine: {e}. PII redaction will be disabled.")
            _anonymizer = None
    return _anonymizer


class PIIDetector:
    """PII detection and redaction."""
    
    def __init__(self):
        self.enabled = settings.pii_redaction_enabled and PRESIDIO_AVAILABLE
        self.entities = settings.pii_entities
        self._analyzer = None
        self._anonymizer = None
    
    def detect_pii(self, text: str) -> List[Dict]:
        """Detect PII in text."""
        if not self.enabled:
            return []
        
        if not PRESIDIO_AVAILABLE:
            logger.debug("Presidio not available; skipping PII detection.")
            return []

        analyzer = _get_analyzer()
        if analyzer is None:
            return []
        
        try:
            results = analyzer.analyze(
                text=text,
                entities=self.entities,
                language='en'
            )
            return [
                {
                    "entity_type": result.entity_type,
                    "start": result.start,
                    "end": result.end,
                    "score": result.score,
                    "text": text[result.start:result.end]
                }
                for result in results
            ]
        except Exception as e:
            logger.warning(f"PII detection failed: {e}")
            return []
    
    def redact_pii(self, text: str, replacement: str = "[REDACTED]") -> str:
        """Redact PII from text."""
        if not self.enabled:
            return text

        if not PRESIDIO_AVAILABLE or OperatorConfig is None:
            logger.debug("Presidio not available; returning original text.")
            return text
        
        analyzer = _get_analyzer()
        anonymizer = _get_anonymizer()
        
        if analyzer is None or anonymizer is None:
            return text
        
        try:
            # Detect PII
            analyzer_results = analyzer.analyze(
                text=text,
                entities=self.entities,
                language='en'
            )
            
            if not analyzer_results:
                return text
            
            # Anonymize
            anonymizer_result = anonymizer.anonymize(
                text=text,
                analyzer_results=analyzer_results,
                operators={
                    "DEFAULT": OperatorConfig(operator="replace", new_value=replacement)
                }
            )
            
            return anonymizer_result.text
        except Exception as e:
            logger.warning(f"PII redaction failed: {e}, returning original text")
            return text
    
    def has_pii(self, text: str) -> bool:
        """Check if text contains PII."""
        return len(self.detect_pii(text)) > 0


# Global instance
pii_detector = PIIDetector()

