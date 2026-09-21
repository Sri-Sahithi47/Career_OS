import React from 'react'
import { StarSolidIcon, BookmarkIcon } from '../icons/DashboardIcons'
import { getDisplayMatchScore, getJobId } from '../../lib/jobs'

export const JobRecommendations = ({ topMatches, setSelectedJob, onViewAll, onTailor, onSave }) => {
  return (
    <>
      <div className="tj-recommend-header">
        <div className="tj-rec-copy">
          <h2><StarSolidIcon style={{ color: '#10B981' }} /> Recommended Jobs</h2>
          <p className="tj-rec-subtitle">Based on your recent application activity</p>
        </div>
        <button type="button" className="tj-view-all-matches" onClick={onViewAll}>
          View all matches {'>'}
        </button>
      </div>

      <div className="tj-rec-grid-3col">
        {topMatches.map((job) => {
          const matchScore = getDisplayMatchScore(job);
          return (
            <div key={getJobId(job)} className="tj-rec-card" onClick={() => setSelectedJob(job)}>
              <div className="tj-rec-card-top">
                <div className="tj-rec-info">
                  <div className="tj-rec-logo-box">
                    {job.Company ? job.Company[0] : 'J'}
                  </div>
                  <div className="tj-rec-title-wrap">
                    <h4 className="tj-rec-job-title">{job.Title || 'Role unknown'}</h4>
                    <p className="tj-rec-job-meta">{job.Company || 'Company'} • {job.Location || 'Remote'}</p>
                  </div>
                </div>
                <div className="tj-rec-match-badge">{matchScore}% Match</div>
              </div>
              <div className="tj-rec-card-bottom">
                <div className="tj-rec-tags">
                  {job['Job Type'] && <span className="tj-rec-tag">{job['Job Type']}</span>}
                  {job.Level && <span className="tj-rec-tag">{job.Level}</span>}
                </div>
                {job.Salary && <div className="tj-rec-salary">{job.Salary}</div>}
              </div>
              <div className="tj-rec-card-actions">
                <button type="button" className="tj-btn-tailor-resume" onClick={(event) => { event.stopPropagation(); onTailor?.(job) }}>Tailor Resume</button>
                <button type="button" className="tj-btn-bookmark" aria-label={`Save ${job.Title}`} onClick={(event) => { event.stopPropagation(); onSave?.(job) }}>
                  <BookmarkIcon />
                </button>
              </div>
            </div>
          )
        })}
        {topMatches.length === 0 && (
          <div style={{ padding: '24px', color: '#64748B', fontStyle: 'italic', background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            No recommendations currently found.
          </div>
        )}
      </div>
    </>
  )
}
