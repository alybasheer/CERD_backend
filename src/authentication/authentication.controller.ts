import { BadRequestException, Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticationService } from './authentication.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LocationDto } from './dto/location.dto';
import { SessionService } from './session.service';

@Controller('authentication')
export class AuthenticationController {
    constructor(private readonly authService: AuthenticationService, private readonly sessions: SessionService) { }

    @Post('signup')
    async signup(@Body() body: SignupDto) {
        const result = await this.authService.create(body);
        // result is { user, access_token }
        return {
            success: true,
            ...await this.sessions.create(String(result.user._id)),
        };
    }

    @Post('login')
    async login(@Body() loginDto: LoginDto) {
        const auth = await this.authService.validateUser(loginDto.email, loginDto.password);
        if (!auth) { throw new UnauthorizedException('Invalid email or password') };
        // auth is { user, access_token }
        return {
            success: true,
            ...await this.sessions.create(String(auth.user._id)),
        };
    }

    /**
     * POST /authentication/location
     * Saves the user's current coordinates. The frontend should call this
     * after obtaining permission to read location (navigator.geolocation API
     * on web). The request must include the Authorization: Bearer <token>
     * header so we can identify the user via JWT `sub`.
     *
     * Frontend flow (summary):
     * - Ask user for permission to access location (browser prompt).
     * - On success, read latitude/longitude from `navigator.geolocation.getCurrentPosition`.
     * - POST to this endpoint with JSON { latitude, longitude } and header `Authorization: Bearer <token>`.
     */
    @UseGuards(JwtAuthGuard)
    @Post('location')
    @UseGuards(JwtAuthGuard)
    async updateLocation(@Req() req: { user: { sub: string } }, @Body() body: LocationDto) {
        return this.authService.updateLocationById(req.user.sub, body.latitude, body.longitude);
    }

    @Post('google-login')
    async loginWithGoogle(@Body() body: GoogleLoginDto) {
        if (!body.idToken) {
            throw new BadRequestException('idToken is required');
        }

        try {
            const result = await this.authService.loginWithGoogle(body.idToken, body.username);

            return {
                success: true,
                ...await this.sessions.create(String(result.user._id)),
            };
        } catch (error) {
            throw new UnauthorizedException('Google login failed: ' + error.message);
        }
    }

    @Post('refresh')
    refresh(@Body() body: { refresh_token?: string }) {
        return this.sessions.refresh(body.refresh_token);
    }

    @Post('logout')
    logout(@Body() body: { refresh_token?: string }) {
        return this.sessions.revoke(body.refresh_token);
    }
}
