import React from 'react'
import { SearchIcon, ResumeIcon, ArrowRightIcon } from '../icons/DashboardIcons'

export const ActionCards = ({ navigate }) => {
  return (
    <div className="tj-action-col">
      <div className="tj-action-card" onClick={() => navigate('/jobs')}>
        <div className="tj-action-icon-box">
          <SearchIcon />
        </div>
        <div className="tj-action-info">
          <h3>Run Search</h3>
          <p>Scan 3 platforms for new matches</p>
        </div>
        <ArrowRightIcon className="tj-action-arrow" />
      </div>

      <div className="tj-action-card" onClick={() => navigate('/tailor')}>
        <div className="tj-action-icon-box">
          <ResumeIcon />
        </div>
        <div className="tj-action-info">
          <h3>Tailor Resume</h3>
          <p>Optimize for a specific job</p>
        </div>
        <ArrowRightIcon className="tj-action-arrow" />
      </div>
    </div>
  )
}
