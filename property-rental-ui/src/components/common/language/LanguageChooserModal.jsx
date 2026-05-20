import React from 'react';
import { HiCheck } from 'react-icons/hi2';
import './LanguageChooserModal.css';

const options = [
  { code: 'en', titleKey: 'language.optionEnglishTitle', descriptionKey: 'language.optionEnglishDescription' },
  { code: 'ne', titleKey: 'language.optionNepaliTitle', descriptionKey: 'language.optionNepaliDescription' },
];

export default function LanguageChooserModal({ open, activeLanguage, saving, error, onSelect, t }) {
  if (!open) return null;

  return (
    <div className="modal-overlay language-chooser-overlay">
      <div className="modal-content language-chooser-card" role="dialog" aria-modal="true" aria-labelledby="language-chooser-title">
        <div className="language-chooser-copy">
          <span className="language-chooser-eyebrow">{t('common.appName')}</span>
          <h2 id="language-chooser-title">{t('language.chooserTitle')}</h2>
          <p>{t('language.chooserSubtitle')}</p>
        </div>

        <div className="language-chooser-grid">
          {options.map((option) => {
            const selected = activeLanguage === option.code;
            return (
              <button
                key={option.code}
                type="button"
                className={`language-option${selected ? ' active' : ''}`}
                onClick={() => onSelect(option.code)}
                disabled={saving}
              >
                <div className="language-option-head">
                  <strong>{t(option.titleKey)}</strong>
                  {selected ? (
                    <span className="language-option-check" aria-hidden="true">
                      <HiCheck />
                    </span>
                  ) : null}
                </div>
                <span>{t(option.descriptionKey)}</span>
                <small>{t('language.chooserButton', { language: t(option.titleKey) })}</small>
              </button>
            );
          })}
        </div>

        {error ? <p className="language-chooser-error">{error}</p> : null}
      </div>
    </div>
  );
}
