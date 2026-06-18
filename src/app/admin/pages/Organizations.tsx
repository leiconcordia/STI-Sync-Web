import { useState } from 'react';
import { Building2, Users, Calendar, Plus, Edit, Archive, Ban } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { CreateClubModal } from '../../modules/organizations';
import { useAdviserProfile } from '../../modules/auth';

import { useOrganizationStream } from '../../modules/organizations/hooks/useOrganizationStream';
import { useOrganizationTypes } from '../../modules/organizations/hooks/useOrganizationTypes';

export function Organizations() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { profile } = useAdviserProfile();
  
  const { data: organizations, loading } = useOrganizationStream();
  const { data: orgTypes } = useOrganizationTypes();

  const getOrgType = (typeId: string) => orgTypes.find(t => t.id === typeId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Organization Management</h2>
          <p className="text-gray-500 text-sm">Manage all registered student organizations</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-[#001A4D] hover:bg-[#0E4EBD] text-white">
          <Plus className="w-4 h-4 mr-2 text-[#FFC107]" />
          Create Organization
        </Button>
      </div>

      {isModalOpen && (
        <CreateClubModal
          createdBy={profile?.uid ?? 'system'}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => setIsModalOpen(false)}
          isOpen={isModalOpen}
        />
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-[#E0E0E0]">
          <CardHeader>
            <CardTitle className="text-sm text-gray-600">Total Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#001A4D]">{organizations.length}</div>
          </CardContent>
        </Card>
        <Card className="border-[#E0E0E0]">
          <CardHeader>
            <CardTitle className="text-sm text-gray-600">Total Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#001A4D]">
              {organizations.reduce((acc, org) => acc + (org.memberCount || 0), 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#E0E0E0]">
          <CardHeader>
            <CardTitle className="text-sm text-gray-600">Active Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#001A4D]">42</div>
          </CardContent>
        </Card>
        <Card className="border-[#E0E0E0]">
          <CardHeader>
            <CardTitle className="text-sm text-gray-600">Pending Applications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#FFC107]">3</div>
          </CardContent>
        </Card>
      </div>

      {/* Organization Cards Grid */}
      {loading ? (
        <div className="flex justify-center p-12 text-gray-400">Loading organizations...</div>
      ) : organizations.length === 0 ? (
        <div className="text-center p-12 border-2 border-dashed rounded-xl border-gray-300 text-gray-500">
          No organizations registered yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {organizations.map((org) => {
            const orgType = getOrgType(org.typeId);
            return (
              <Card key={org.id} className="border-[#E0E0E0] hover:shadow-lg transition-shadow">
                <div className={`h-20 bg-gradient-to-r from-[#0E4EBD] to-[#1E70E8] rounded-t-lg relative`} style={orgType?.color ? { background: orgType.color } : {}}>
                  <div className="absolute -bottom-8 left-6">
                    <div className="w-16 h-16 bg-[#001A4D] rounded-full flex items-center justify-center text-white font-bold text-lg border-4 border-white shadow-lg overflow-hidden">
                      {org.logoUrl ? (
                        <img src={org.logoUrl} alt={org.acronym} className="w-full h-full object-cover" />
                      ) : (
                        org.acronym || 'ORG'
                      )}
                    </div>
                  </div>
                </div>
                <CardContent className="pt-12 space-y-4">
                  <div>
                    <h3 className="font-bold text-[#001A4D] mb-1 truncate" title={org.name}>{org.name}</h3>
                    <Badge className="bg-[#FFD54F] text-[#001A4D] hover:bg-[#FFC107]">
                      {orgType?.name || 'Unknown Type'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      <span>{org.memberCount || 0} members</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>0 events</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Badge className={`border-0 text-white ${org.status === 'active' ? 'bg-gradient-to-r from-[#22C55E] to-[#16A34A]' : 'bg-gray-400'}`}>
                      {org.status.charAt(0).toUpperCase() + org.status.slice(1)}
                    </Badge>
                  </div>

              <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                <Button size="sm" variant="link" className="text-[#0E4EBD] hover:text-[#1E70E8] px-0">
                  View Details →
                </Button>
                <div className="flex-1" />
                <Button size="sm" variant="ghost" className="p-2 h-auto">
                  <Edit className="w-4 h-4 text-[#1E70E8]" />
                </Button>
                <Button size="sm" variant="ghost" className="p-2 h-auto">
                  <Ban className="w-4 h-4 text-[#FFC107]" />
                </Button>
                <Button size="sm" variant="ghost" className="p-2 h-auto">
                  <Archive className="w-4 h-4 text-gray-500" />
                </Button>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}
