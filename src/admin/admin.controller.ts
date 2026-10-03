import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
        private readonly jwtService: JwtService,
    ) { }

    private verifyTokenAndGetPayload(authHeader: string) {
        if (!authHeader) throw new UnauthorizedException('Authorization header required');
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const payload: any = this.jwtService.verify(token);
        return payload;
    }

    private ensureAdmin(payload: any) {
        if (payload.role !== 'admin') throw new ForbiddenException('Admin credentials required');
    }

    /**
     * GET /admin/volunteer-applications
     * Retrieve all volunteer applications (optionally filtered by status)
     * Query params: status (optional) - "pending", "approved", "rejected"
     */
    @Get('volunteer-applications')
    async getApplications(
        @Headers('authorization') auth: string,
        @Query('status') status?: string,
    ) {
        const payload = this.verifyTokenAndGetPayload(auth);
        this.ensureAdmin(payload);

        let applications;
        if (status) {
            applications = await this.adminService.getAllApplications(status);
        } else {
            applications = await this.adminService.getAllPendingApplications();
        }

        return {
            success: true,
            message: `Found ${applications.length} applications`,
            data: applications,
        };
    }

    /**
     * GET /admin/volunteer-applications/:id
     * Retrieve a specific volunteer application
     */
    @Get('volunteer-applications/:id')
    async getApplicationById(
        @Headers('authorization') auth: string,
        @Param('id') id: string,
    ) {
        const payload = this.verifyTokenAndGetPayload(auth);
        this.ensureAdmin(payload);

        const application = await this.adminService.getApplicationById(id);
        return {
            success: true,
            data: application,
        };
    }

    /**
     * POST /admin/volunteer-applications/:id/approve
     * Approve a volunteer application and update user role to 'volunteer'
     */
    @Post('volunteer-applications/:id/approve')
    async approveApplication(
        @Headers('authorization') auth: string,
        @Param('id') id: string,
    ) {
        const payload = this.verifyTokenAndGetPayload(auth);
        this.ensureAdmin(payload);

        const application = await this.adminService.approveApplication(id);
        return {
            success: true,
            message: 'Application approved and user role updated to volunteer',
            data: application,
        };
    }

    /**
     * POST /admin/volunteer-applications/:id/reject
     * Reject a volunteer application and reset user role to 'user'
     */
    @Post('volunteer-applications/:id/reject')
    async rejectApplication(
        @Headers('authorization') auth: string,
        @Param('id') id: string,
    ) {
        const payload = this.verifyTokenAndGetPayload(auth);
        this.ensureAdmin(payload);

        const application = await this.adminService.rejectApplication(id);
        return {
            success: true,
            message: 'Application rejected and user role reset to user',
            data: application,
        };
    }

    @Patch('accounts/:id/block')
    async blockAccount(
        @Req() req: any,
        @Param('id') id: string,
        @Body() body: { reason?: string },
    ) {
        this.ensureAdmin(req.user);
        const reason = body.reason?.trim();
        if (!reason) throw new BadRequestException('A moderation reason is required');
        const account = await this.adminService.blockAccount(id, reason, req.user.sub);
        return { success: true, message: 'Account blocked', data: account };
    }

    @Patch('accounts/:id/remove-volunteer')
    async removeVolunteer(
        @Req() req: any,
        @Param('id') id: string,
        @Body() body: { reason?: string },
    ) {
        this.ensureAdmin(req.user);
        const reason = body.reason?.trim();
        if (!reason) throw new BadRequestException('A moderation reason is required');
        const account = await this.adminService.removeVolunteerRole(id, reason, req.user.sub);
        return { success: true, message: 'Volunteer access removed', data: account };
    }

    @Get('approved-volunteers/:id/feedback')
    async volunteerFeedback(
        @Req() req: any,
        @Param('id') id: string,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        this.ensureAdmin(req.user);
        const data = await this.adminService.getVolunteerFeedback(
            id,
            Number.parseInt(page, 10) || 1,
            Number.parseInt(limit, 10) || 20,
        );
        return { success: true, data };
    }
}
